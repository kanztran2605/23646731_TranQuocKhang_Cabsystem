"""LOCAL DEVELOPMENT ONLY: preserve the cluster and recover the current CAB baseline.

Requires Docker, Node, POSTGRES_USER=cab, POSTGRES_PASSWORD and the Driver
DATA_ENCRYPTION_KEY_BASE64 in the caller's environment. Supply the inspected
existing superuser with --superuser. An optional DATA_ENCRYPTION_LEGACY_KEY_BASE64
must come from verified old runtime metadata. Backups are private local artifacts.
No database/table/volume is dropped. Use --booking-only for the later Booking schema milestone.
"""
import argparse
import base64
import datetime
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DATABASES = ['auth_db', 'customer_db', 'driver_db', 'booking_db', 'trip_db', 'payment_db', 'review_db']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--superuser', required=True)
parser.add_argument('--container', default='cab-postgres')
parser.add_argument('--booking-only', action='store_true', help='Backup and repair only booking_db; leave completed/unrelated schemas unchanged')
parser.add_argument('--remaining-only', action='store_true', help='Backup and repair only Trip/Payment/Review; preserve old schemas in verified archives')
args = parser.parse_args()
password = os.environ.get('POSTGRES_PASSWORD', '')
key = os.environ.get('DATA_ENCRYPTION_KEY_BASE64', '')
if os.environ.get('POSTGRES_USER') != 'cab' or not password:
    raise SystemExit('Canonical PostgreSQL runtime credentials must be supplied through ENV')
try:
    if not args.booking_only and not args.remaining_only and len(base64.b64decode(key, validate=True)) != 32:
        raise ValueError()
except ValueError:
    raise SystemExit('A valid Driver encryption key must be supplied through ENV')


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def sql(database, statement):
    result = subprocess.run(['docker', 'exec', '-i', args.container, 'psql', '-X', '-U', args.superuser,
                             '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'],
                            input=statement, text=True, capture_output=True)
    if result.returncode:
        # Role creation errors must never disclose a password or its encoded form.
        detail = result.stderr
        for secret in [password, password.replace("'", "''"), base64.b64encode(password.encode()).decode(), key]:
            detail = detail.replace(secret, '[REDACTED]')
        raise RuntimeError('PostgreSQL operation failed in ' + database + ': ' + detail.strip())
    return result.stdout.strip()


def query(database, statement):
    return json.loads(sql(database, statement))


def columns(database, table):
    return query(database, 'SELECT COALESCE(json_object_agg(column_name,data_type),\'{}\'::json) '
                 'FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=' + literal(table))


def rename(database, table, mapping):
    existing = columns(database, table)
    statements = []
    for old, new in mapping.items():
        if old in existing and new in existing:
            raise RuntimeError('Ambiguous old/current columns in ' + database + '.' + table)
        if old in existing:
            statements.append('ALTER TABLE ' + table + ' RENAME COLUMN ' + old + ' TO ' + new + ';')
        elif new not in existing:
            raise RuntimeError('Required column missing in ' + database + '.' + table + ': ' + new)
    return '\n'.join(statements)


def widen(table, fields):
    return '\n'.join('ALTER TABLE ' + table + ' ALTER COLUMN ' + field + ' TYPE BIGINT;' for field in fields)


baseline_text = (ROOT / 'infrastructure/postgres/init.sql').read_text(encoding='utf-8')


def baseline(database):
    section = re.split(r'-- ' + database + r' -+\n', baseline_text)[1]
    section = re.split(r'-- \w+_db -+\n', section)[0]
    section = re.sub(r'\\connect \w+\n', '', section)
    return section.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ').replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ')


if sql('postgres', "SELECT rolsuper FROM pg_roles WHERE rolname=current_user") != 't':
    raise SystemExit('The explicitly selected PostgreSQL role is not a usable superuser')
backups = ROOT / '.backups'
backups.mkdir(exist_ok=True)
backup = backups / ('cab-postgres-before-recovery-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.sql')
with backup.open('wb') as handle:
    dump = subprocess.run(['docker', 'exec', args.container, 'pg_dumpall', '-U', args.superuser], stdout=handle, stderr=subprocess.PIPE)
if dump.returncode or not backup.stat().st_size:
    raise SystemExit('Full logical backup failed; no metadata/schema changes applied')
print('Backup saved:', backup)


def repair_remaining():
    specs = {'trip_db': {'trip':'tid','trip_status_history':'hid','trip_location':'lid'},
             'payment_db': {'payment':'pid'}, 'review_db': {'review':'rid'}}
    customer_map = query('customer_db', "SELECT COALESCE(json_agg(t),'[]'::json) FROM (SELECT cid,uid FROM customer_profile) t")
    driver_map = query('driver_db', "SELECT COALESCE(json_agg(t),'[]'::json) FROM (SELECT did,uid FROM driver) t")
    old_trip = 'trip_id' in columns('trip_db','trip')
    trip_map = query('trip_db', "SELECT COALESCE(json_agg(t),'[]'::json) FROM (SELECT " +
        ('trip_id AS tid,booking_id AS bid,customer_id AS cid,status AS s' if old_trip else 'tid,bid,cid,s') + ' FROM trip) t')
    old_payment = 'payment_id' in columns('payment_db','payment')
    paid_trips = query('payment_db', "SELECT COALESCE(json_agg(t),'[]'::json) FROM (SELECT " +
        ("trip_id AS tid FROM payment WHERE payment_status='COMPLETED'" if old_payment else "tid FROM payment WHERE s='COMPLETED'") + ') t')
    allowed = "'ASSIGNED','ARRIVED','IN_PROGRESS','COMPLETED','CANCELED'"
    if old_trip and sql('trip_db','SELECT count(*) FROM trip WHERE status NOT IN (' + allowed + ')') != '0':
        raise SystemExit('Unknown current Trip state requires a reviewed mapping; no schema changes')
    if old_payment and sql('payment_db',"SELECT count(*) FROM payment WHERE payment_status NOT IN ('PENDING','COMPLETED')") != '0':
        raise SystemExit('Unsupported historical Payment status; no automatic rewrite')
    plans, originals = {}, {}
    for database,tables in specs.items():
        root_table,primary=next(iter(tables.items()));current=columns(database,root_table)
        if not current: plans[database]=[]
        elif primary in current: plans[database]=None
        else:
            existing=query(database,"SELECT COALESCE(json_agg(tablename),'[]'::json) FROM pg_tables WHERE schemaname='public'")
            if sql(database,"SELECT count(*) FROM information_schema.tables WHERE table_schema='legacy_final'") != '0':
                raise SystemExit('Archive conflicts with old schema; no overwrite')
            for table in existing:
                if not re.fullmatch(r'[a-z_]+',table): raise SystemExit('Unexpected table identifier')
                originals[(database,table)]=sql(database,"SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM "+table+' t')
            plans[database]=existing
    temp = ['CREATE TEMP TABLE repair_customer(cid BIGINT PRIMARY KEY,uid BIGINT) ON COMMIT DROP;',
            'CREATE TEMP TABLE repair_driver(did BIGINT PRIMARY KEY,uid BIGINT) ON COMMIT DROP;',
            'CREATE TEMP TABLE repair_trip(tid BIGINT PRIMARY KEY,bid BIGINT,cid BIGINT,s TEXT) ON COMMIT DROP;']
    for row in customer_map: temp.append('INSERT INTO repair_customer VALUES('+str(int(row['cid']))+','+str(int(row['uid']))+');')
    for row in driver_map: temp.append('INSERT INTO repair_driver VALUES('+str(int(row['did']))+','+str(int(row['uid']))+');')
    for row in trip_map: temp.append('INSERT INTO repair_trip VALUES('+','.join(str(int(row[k])) for k in ['tid','bid','cid'])+','+literal(row['s'])+');')
    copies = {
        'trip_db': [
            "INSERT INTO trip(tid,bid,cid,did,vid,customer_uid,driver_uid,s,paid,r,c_at,u_at,done_at,can_at) SELECT t.trip_id,t.booking_id,t.customer_id,t.driver_id,t.vehicle_id,c.uid,d.uid,t.status,t.trip_id IN (" + ','.join(str(int(r['tid'])) for r in paid_trips if r['tid'] is not None) + ('' if paid_trips else '0') + "),t.cancel_reason,t.assigned_at,COALESCE(t.completed_at,t.canceled_at,t.started_at,t.arrived_at,t.assigned_at),t.completed_at,t.canceled_at FROM legacy_final.trip t JOIN repair_customer c ON c.cid=t.customer_id JOIN repair_driver d ON d.did=t.driver_id;",
            "INSERT INTO trip_status_history(hid,tid,from_s,to_s,chg_at) SELECT history_id,trip_id,LAG(to_status) OVER(PARTITION BY trip_id ORDER BY changed_at,history_id),to_status,changed_at FROM legacy_final.trip_status_history WHERE to_status IN ("+allowed+");"],
        'payment_db': ["INSERT INTO payment(pid,bid,tid,cid,customer_uid,amt,eligible,s,ikey,c_at,paid_at) SELECT p.payment_id,t.bid,p.trip_id,p.customer_id,c.uid,p.amount,(t.s='COMPLETED'),p.payment_status,p.idempotency_key,COALESCE(p.paid_at,CURRENT_TIMESTAMP),p.paid_at FROM legacy_final.payment p JOIN repair_trip t ON t.tid=p.trip_id JOIN repair_customer c ON c.cid=p.customer_id;"],
        'review_db': ["INSERT INTO review(rid,tid,cid,did,star,cmt,c_at) SELECT review_id,trip_id,customer_id,driver_id,score,comment,created_at FROM legacy_final.review;"],
    }
    scripts={}
    for database,tables in specs.items():
        archived=plans[database];statements=list(temp)
        if archived:
            statements += ['CREATE SCHEMA legacy_final;']+['ALTER TABLE public.'+t+' SET SCHEMA legacy_final;' for t in archived]
        statements.append(baseline(database))
        if archived:
            statements += copies[database]
            root_table=next(iter(tables))
            statements.append("DO $$ BEGIN IF (SELECT count(*) FROM "+root_table+") <> (SELECT count(*) FROM legacy_final."+root_table+") THEN RAISE EXCEPTION 'Identity mapping incomplete'; END IF; END $$;")
        elif archived is None and database != 'review_db':
            root_table=next(iter(tables))
            for field,local,source in [('customer_uid','cid','repair_customer')]+([('driver_uid','did','repair_driver')] if database=='trip_db' else []):
                statements.append('ALTER TABLE '+root_table+' ADD COLUMN IF NOT EXISTS '+field+' BIGINT;')
                statements.append('UPDATE '+root_table+' r SET '+field+'=m.uid FROM '+source+' m WHERE r.'+local+'=m.'+local+' AND r.'+field+' IS NULL;')
                statements.append('ALTER TABLE '+root_table+' ALTER COLUMN '+field+' SET NOT NULL;')
        for table,primary in tables.items():
            if archived: statements.append("SELECT setval(pg_get_serial_sequence('"+table+"','"+primary+"'),GREATEST(1,(SELECT COALESCE(MAX("+primary+"),1) FROM "+table+")),true);")
            statements.append('ALTER TABLE '+table+' OWNER TO cab;')
        statements.append('GRANT USAGE,CREATE ON SCHEMA public TO cab; GRANT ALL ON ALL TABLES IN SCHEMA public TO cab; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO cab;')
        scripts[database]='\n'.join(statements)
    # Validate every copy and constraint in rollback transactions first.
    for database,script in scripts.items(): sql(database,'BEGIN;\n'+script+'\nROLLBACK;')
    for database,script in scripts.items():
        sql(database,'BEGIN;\n'+script+'\nCOMMIT;')
        for table in plans[database] or []:
            digest=sql(database,"SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM legacy_final."+table+' t')
            if digest != originals[(database,table)]: raise SystemExit('Archive digest mismatch; inspect backup')
        print('PASS',database,'canonical schema, verified intact originals and runtime grants')
    print('Historical completed Payment amount retained unchanged; new Booking Payments use 50000. Original history, including obsolete intermediate steps, remains intact in legacy_final.')


if args.remaining_only:
    repair_remaining()
    raise SystemExit(0)


def repair_booking():
    existing = columns('booking_db', 'booking')
    if 'booking_id' in existing:
        for table in ['booking', 'driver_offer', 'driver_assignment']:
            if columns('booking_db', 'legacy_' + table):
                raise SystemExit('Booking archive already exists beside old tables; stop without overwriting')
        # The inspected old cluster used numeric Car 4/7-seat categories. This
        # local repair reads only their labels; application DB ownership is unchanged.
        categories = query('driver_db', "SELECT COALESCE(json_agg(t.name),'[]'::json) FROM vehicle_type t WHERE vehicle_type_id IN (" +
                           sql('booking_db', 'SELECT COALESCE(string_agg(DISTINCT requested_vehicle_type_id::text,\',\'),\'0\') FROM booking') + ')')
        if not categories or any(name not in ['Car 4 seats', 'Car 7 seats'] for name in categories):
            raise SystemExit('Unknown old Booking vehicle category; no mapping guessed')
        booking_count = sql('booking_db', 'SELECT count(*) FROM booking')
        offer_count = sql('booking_db', "SELECT count(*) FROM driver_offer WHERE status='ACCEPTED'")
        assignment_count = sql('booking_db', 'SELECT count(*) FROM driver_assignment')
        if sql('booking_db', "SELECT count(*) FROM booking WHERE status NOT IN ('SEARCHING','ASSIGNED','NO_DRIVER_FOUND')") != '0':
            raise SystemExit('Unsupported old Booking status; original data left unchanged')
        if sql('booking_db', "SELECT count(*) FROM driver_offer WHERE status NOT IN ('ACCEPTED','EXPIRED')") != '0':
            raise SystemExit('Unreviewed live legacy Offer state; no automatic conversion')
        original = {table: sql('booking_db', 'SELECT md5(COALESCE(json_agg(row_to_json(t) ORDER BY ' + key + ")::text,'[]')) FROM " + table + ' t')
                    for table,key in [('booking','booking_id'),('driver_offer','offer_id'),('driver_assignment','assignment_id')]}
        statements = ['ALTER TABLE ' + t + ' RENAME TO legacy_' + t + ';' for t in ['booking','driver_offer','driver_assignment']]
        statements += [baseline('booking_db'),
            "INSERT INTO booking(bid,cid,p_lat,p_lng,p_addr,d_lat,d_lng,d_addr,vt,s,c_at,ass_at) "
            "SELECT b.booking_id,b.customer_id,b.pickup_latitude,b.pickup_longitude,b.pickup_address,b.destination_latitude,b.destination_longitude,b.destination_address,'CAR',b.status,b.created_at,a.assigned_at "
            "FROM legacy_booking b LEFT JOIN legacy_driver_assignment a USING(booking_id);",
            "INSERT INTO driver_offer(oid,bid,did,vid,s,c_at,acc_at) SELECT offer_id,booking_id,driver_id,vehicle_id,status,created_at,COALESCE(responded_at,a.assigned_at) "
            "FROM legacy_driver_offer o LEFT JOIN legacy_driver_assignment a USING(offer_id,booking_id,driver_id,vehicle_id) WHERE status='ACCEPTED';",
            "INSERT INTO driver_assignment(aid,bid,oid,did,vid,ass_at) SELECT assignment_id,booking_id,offer_id,driver_id,vehicle_id,assigned_at FROM legacy_driver_assignment;"]
        for table,new_key,old_key in [('booking','bid','booking_id'),('driver_offer','oid','offer_id'),('driver_assignment','aid','assignment_id')]:
            statements.append("SELECT setval(pg_get_serial_sequence('" + table + "','" + new_key + "'),GREATEST(1,(SELECT COALESCE(MAX(" + old_key + "),1) FROM legacy_" + table + ")),true);")
        # Dry run catches duplicate old Offers/FK inconsistencies before committing.
        sql('booking_db', 'BEGIN;\n' + '\n'.join(statements) + '\nROLLBACK;')
        sql('booking_db', 'BEGIN;\n' + '\n'.join(statements) + '\nCOMMIT;')
        for table,old_key in [('booking','booking_id'),('driver_offer','offer_id'),('driver_assignment','assignment_id')]:
            archived = sql('booking_db', 'SELECT md5(COALESCE(json_agg(row_to_json(t) ORDER BY ' + old_key + ")::text,'[]')) FROM legacy_" + table + ' t')
            if archived != original[table]:
                raise SystemExit('Booking archive digest verification failed; inspect backup')
        for table,expected in [('booking',booking_count),('driver_offer',offer_count),('driver_assignment',assignment_count)]:
            if sql('booking_db','SELECT count(*) FROM ' + table) != expected:
                raise SystemExit('Booking copy count verification failed; inspect backup')
        print('PASS original Booking/Offer/Assignment rows preserved in verified archives; compatible rows copied')
    elif 'bid' not in existing:
        raise SystemExit('Unknown Booking schema; no automatic repair')
    else:
        sql('booking_db', baseline('booking_db'))
    sql('booking_db', 'GRANT USAGE,CREATE ON SCHEMA public TO cab; GRANT ALL ON booking,driver_offer,driver_assignment TO cab; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO cab;')
    required = {'booking':['bid','cid','p_lat','p_lng','d_lat','d_lng','vt','s','c_at','ass_at'],
                'driver_offer':['oid','bid','did','vid','s','c_at','acc_at'],
                'driver_assignment':['aid','bid','oid','did','vid','ass_at']}
    for table,fields in required.items():
        if not set(fields).issubset(columns('booking_db',table)):
            raise SystemExit('Incomplete canonical Booking schema')
    print('PASS canonical booking_db schema and runtime grants; no unrelated schemas changed')


if args.booking_only:
    repair_booking()
    raise SystemExit(0)


# Preflight license conversion before any schema writes. Original values stay
# in the full backup; decrypted values never leave the Node process or get logged.
profile_columns = columns('driver_db', 'driver_profile')
license_column = 'lic_enc' if 'lic_enc' in profile_columns else 'driver_license_ciphertext'
driver_column = 'did' if 'did' in profile_columns else 'driver_id'
licenses = query('driver_db', 'SELECT COALESCE(json_agg(json_build_object(\'did\',' + driver_column + ',\'value\',' + license_column + ')),\'[]\'::json) FROM driver_profile')
conversion = r"""
const fs = require('node:fs');
const crypto = require('node:crypto');
const { encryptLicense, decryptLicense } = require('./services/driver-service/src/security/license');
const items = JSON.parse(fs.readFileSync(0,'utf8')).map(({did,value}) => {
  if (value == null) return {did,value:null};
  let converted;
  if (value.startsWith('enc:v1:')) converted = encryptLicense(value.slice(7));
  else {
    try { decryptLicense(value); converted=value; }
    catch (_) {
      const parts=value.split(':');
      if (parts.length!==4 || parts[0]!=='v1') throw new Error('Unsupported license encoding at Driver ID '+did);
      converted=[parts[0],parts[1],parts[3],parts[2]].join(':');
      try { decryptLicense(converted); }
      catch (_) {
        try {
          const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(process.env.DATA_ENCRYPTION_LEGACY_KEY_BASE64 || '', 'base64'),Buffer.from(parts[1],'base64'));
          d.setAuthTag(Buffer.from(parts[2],'base64'));
          const plaintext=Buffer.concat([d.update(Buffer.from(parts[3],'base64')),d.final()]).toString('utf8');
          converted=encryptLicense(plaintext);
          if(decryptLicense(converted)!==plaintext) throw new Error();
        } catch (_) { throw new Error('Unreadable legacy encrypted license at Driver ID '+did); }
      }
    }
  }
  decryptLicense(converted);
  if(converted.length>255) throw new Error('License exceeds canonical storage at Driver ID '+did);
  return {did,value:converted};
});
process.stdout.write(JSON.stringify({items,
  seedLicenses:Array.from({length:5},(_,i)=>encryptLicense('DL-DEMO-'+String(i+1).padStart(3,'0'))),
  wrappedLegacyKey:process.env.DATA_ENCRYPTION_LEGACY_KEY_BASE64 ? encryptLicense(process.env.DATA_ENCRYPTION_LEGACY_KEY_BASE64) : null}));
"""
converted = subprocess.run(['node', '-e', conversion], cwd=ROOT, input=json.dumps(licenses), text=True, capture_output=True)
if converted.returncode:
    raise SystemExit('License preflight failed; database unchanged. ' + converted.stderr)
converted = json.loads(converted.stdout)
licenses = converted['items']
if converted['wrappedLegacyKey']:
    backup.with_suffix('.legacy-key.enc').write_text(converted['wrappedLegacyKey'], encoding='utf-8')


maps = {
 'driver': {'driver_id':'did','user_id':'uid','approval_status':'ap','availability_status':'av','created_at':'c_at'},
 'driver_profile': {'driver_id':'did','full_name':'name','driver_license_ciphertext':'lic_enc','encryption_key_version':'key_ver'},
 'driver_location': {'driver_id':'did','latitude':'lat','longitude':'lng','recorded_at':'rec_at'},
 'vehicle': {'vehicle_id':'vid','driver_id':'did','license_plate':'plate','status':'s'},
 'driver_application': {'application_id':'appid','driver_id':'did','vehicle_id':'vid','status':'s','reviewed_by_user_id':'rev_uid','submitted_at':'sub_at','reviewed_at':'rev_at'},
}
ids = {'driver':['did','uid'],'driver_profile':['did'],'driver_location':['did'],
       'vehicle':['vid','did'],'driver_application':['appid','did','vid','rev_uid']}
statements = [rename('driver_db', table, mapping) for table,mapping in maps.items()]
statements += [widen(table,fields) for table,fields in ids.items()]
if 'vt' not in columns('driver_db','vehicle'):
    types = query('driver_db', 'SELECT COALESCE(json_agg(DISTINCT t.name),\'[]\'::json) FROM vehicle v JOIN vehicle_type t USING(vehicle_type_id)')
    if any(name not in ['Car 4 seats','Car 7 seats'] for name in types):
        raise SystemExit('Unrecognized legacy vehicle category; no category is guessed')
    statements += ["ALTER TABLE vehicle ADD COLUMN vt VARCHAR(50); UPDATE vehicle SET vt='CAR'; ALTER TABLE vehicle ALTER COLUMN vt SET NOT NULL; ALTER TABLE vehicle ALTER COLUMN vehicle_type_id DROP NOT NULL;"]
statements += ["ALTER TABLE driver ALTER COLUMN ap TYPE VARCHAR(30),ALTER COLUMN ap SET DEFAULT 'PENDING_APPROVAL',ALTER COLUMN av SET DEFAULT 'OFFLINE',ADD COLUMN IF NOT EXISTS u_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;",
 "ALTER TABLE driver_profile ALTER COLUMN lic_enc DROP NOT NULL,ADD COLUMN IF NOT EXISTS u_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;",
 "ALTER TABLE vehicle ALTER COLUMN s SET DEFAULT 'ACTIVE',ADD COLUMN IF NOT EXISTS c_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,ADD COLUMN IF NOT EXISTS u_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;",
 "ALTER TABLE driver_application ALTER COLUMN s TYPE VARCHAR(30),ALTER COLUMN s SET DEFAULT 'PENDING_APPROVAL';", baseline('driver_db')]
statements += ['UPDATE driver_profile SET lic_enc=' + ('NULL' if row['value'] is None else literal(row['value'])) + ',key_ver=1 WHERE did=' + str(row['did']) + ';' for row in licenses]
# Dry-run the complete Driver conversion, including existing FK dependencies.
sql('driver_db', 'BEGIN;\n' + '\n'.join(statements) + '\nROLLBACK;')
# Keep unsupported legacy Auth roles and all original account data untouched.
auth_columns = columns('auth_db', 'user_account')
if 'user_id' in auth_columns:
    if columns('auth_db', 'legacy_user_account'):
        raise SystemExit('Existing Auth archive conflicts with an unmigrated table; no automatic overwrite')
    original_digest = sql('auth_db', 'SELECT md5(json_agg(row_to_json(u) ORDER BY user_id)::text) FROM user_account u')
    sql('auth_db', 'BEGIN; ALTER TABLE user_account RENAME TO legacy_user_account;\n' + baseline('auth_db') + "\n"
        "INSERT INTO user_account(uid,email,pw_hash,role,s,c_at,u_at) "
        "SELECT u.user_id,u.email,u.password_hash,r.role_name,CASE WHEN u.status='ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END,u.created_at,u.created_at "
        "FROM legacy_user_account u JOIN role r USING(role_id) WHERE r.role_name IN ('CUSTOMER','DRIVER','ADMIN'); "
        "SELECT setval(pg_get_serial_sequence('user_account','uid'),GREATEST(1,(SELECT COALESCE(MAX(user_id),1) FROM legacy_user_account)),true); COMMIT;")
    if original_digest != sql('auth_db', 'SELECT md5(json_agg(row_to_json(u) ORDER BY user_id)::text) FROM legacy_user_account u'):
        raise SystemExit('Auth archive verification failed; stop and inspect backup')
elif 'uid' not in auth_columns:
    raise SystemExit('Unrecognized Auth schema; stop without guessing a migration')

customer_rename = rename('customer_db', 'customer_profile',
                         {'customer_id':'cid','user_id':'uid','full_name':'name','address':'addr','created_at':'c_at'})
sql('customer_db', 'BEGIN;\n' + customer_rename + '\n' + widen('customer_profile',['cid','uid']) + "\n"
    "ALTER TABLE customer_profile ADD COLUMN IF NOT EXISTS u_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP; COMMIT;")


sql('driver_db', 'BEGIN;\n' + '\n'.join(statements) + '\nCOMMIT;')

encoded_password = base64.b64encode(password.encode()).decode()
sql('postgres', "SET log_statement='none'; SET log_min_error_statement='panic'; DO $repair$ BEGIN "
    "IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='cab') THEN CREATE ROLE cab LOGIN; END IF; "
    "EXECUTE format('ALTER ROLE cab LOGIN PASSWORD %L',convert_from(decode(" + literal(encoded_password) + ",'base64'),'UTF8')); END $repair$;")
existing = query('postgres', "SELECT json_agg(datname) FROM pg_database WHERE NOT datistemplate")
for database in DATABASES:
    if database not in existing:
        sql('postgres', 'CREATE DATABASE ' + database + ' OWNER cab;')
    sql('postgres', 'ALTER DATABASE ' + database + ' OWNER TO cab;')
    sql(database, 'GRANT CONNECT ON DATABASE ' + database + ' TO cab; GRANT USAGE,CREATE ON SCHEMA public TO cab; '
        'GRANT ALL ON ALL TABLES IN SCHEMA public TO cab; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO cab; '
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO cab; '
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO cab;')

# Preserve existing IDs and accounts. Canonical demo email identifies a seed;
# newly inserted accounts use unoccupied identity values rather than IDs 1..7.
demo = [('c@c.com','CUSTOMER'),('d@d.com','DRIVER'),('d2@d.com','DRIVER'),('d3@d.com','DRIVER'),
        ('d4@d.com','DRIVER'),('d5@d.com','DRIVER'),('a@a.com','ADMIN')]
sql('auth_db', "CREATE EXTENSION IF NOT EXISTS pgcrypto; INSERT INTO user_account(email,pw_hash,role,s) "
    "SELECT seed.email,crypt('123',gen_salt('bf',10)),seed.role,'ACTIVE' FROM (VALUES " +
    ','.join('(' + literal(email) + ',' + literal(role) + ')' for email,role in demo) +
    ') seed(email,role) WHERE NOT EXISTS(SELECT FROM user_account u WHERE u.email=seed.email) ON CONFLICT(email) DO NOTHING;')
accounts = query('auth_db', 'SELECT json_object_agg(email,uid) FROM user_account WHERE email IN (' +
                 ','.join(literal(email) for email,role in demo) + ')')
demo_valid = sql('auth_db', "SELECT COUNT(*) FROM user_account u JOIN (VALUES " +
                 ','.join('('+literal(email)+','+literal(role)+')' for email,role in demo) +
                 ") expected(email,role) ON u.email=expected.email AND u.role=expected.role "
                 "WHERE u.s='ACTIVE' AND u.pw_hash=crypt('123',u.pw_hash)")
if demo_valid != '7':
    raise SystemExit('Existing demo account credentials differ; unrelated/current account data was not overwritten')
sql('customer_db', "INSERT INTO customer_profile(uid,name,addr) VALUES (" + str(accounts['c@c.com']) +
    ",'Customer Demo','HCMC') ON CONFLICT(uid) DO NOTHING;")
approval = ['APPROVED','APPROVED','APPROVED','PENDING_APPROVAL','REJECTED']
availability = ['AVAILABLE','BUSY','OFFLINE','OFFLINE','OFFLINE']
for index,email in enumerate(['d@d.com','d2@d.com','d3@d.com','d4@d.com','d5@d.com']):
    user_id = str(accounts[email])
    sql('driver_db', 'INSERT INTO driver(uid,ap,av) SELECT ' + user_id + ',' + literal(approval[index]) + ',' +
        literal(availability[index]) + ' WHERE NOT EXISTS(SELECT FROM driver WHERE uid=' + user_id + ') ON CONFLICT(uid) DO NOTHING;')
    driver_id = sql('driver_db', 'SELECT did FROM driver WHERE uid=' + user_id)
    plate = 'CAB-DEMO-' + user_id
    sql('driver_db', 'BEGIN; INSERT INTO driver_profile(did,name,lic_enc,key_ver) VALUES (' + driver_id + ',' +
        literal('Driver Demo ' + str(index+1)) + ',' + literal(converted['seedLicenses'][index]) + ',1) ON CONFLICT(did) DO NOTHING; '
        'INSERT INTO driver_location(did,lat,lng) VALUES (' + driver_id + ',' + str(10.76+index*0.0005) + ',' + str(106.68+index*0.0005) +
        ') ON CONFLICT(did) DO NOTHING; '
        'INSERT INTO vehicle(did,vt,plate,brand,model) SELECT ' + driver_id + ",'CAR'," + literal(plate) + ",'Toyota','Vios' "
        'WHERE NOT EXISTS(SELECT FROM vehicle WHERE did=' + driver_id + '); '
        'INSERT INTO driver_application(did,vid,s,rev_uid,rev_at) SELECT d.did,v.vid,d.ap,' + str(accounts['a@a.com']) +
        ",CASE WHEN d.ap='PENDING_APPROVAL' THEN NULL ELSE CURRENT_TIMESTAMP END FROM driver d JOIN vehicle v ON v.did=d.did "
        'WHERE d.did=' + driver_id + ' AND NOT EXISTS(SELECT FROM driver_application a WHERE a.did=d.did); COMMIT;')
demo_customer_id = sql('customer_db', 'SELECT cid FROM customer_profile WHERE uid=' + str(accounts['c@c.com']))
demo_driver_id = sql('driver_db', 'SELECT did FROM driver WHERE uid=' + str(accounts['d@d.com']))
print('PASS schema recovery, intact Auth archive, cab login/grants and seven canonical databases')
print('PASS canonical demo seed; customer CID:',demo_customer_id,'driver DID:',demo_driver_id,'admin UID:',accounts['a@a.com'])
