"""Quản trị LOCAL: chuẩn bị đúng t1..t5, không đổi Driver khác hay schema.

Mặc định chỉ kiểm tra. --apply backup trước khi ghi. t2 BUSY qua Booking/Accept
thật, không gán BUSY giả. Không ép t1 AVAILABLE nếu còn chuyến/assignment mở.
Chạy từ Git Bash: python scripts/prepare-demo-drivers.py --apply --backup-user cab_user
"""
import argparse
import datetime
import json
import re
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DRIVERS = [
    ('t1@d.com','Nguyen Van An','0900000101','APPROVED','AVAILABLE','BIKE','59A10001',10.8000,106.7200),
    ('t2@d.com','Tran Van Binh','0900000102','APPROVED','BUSY','CAR','59B10002',10.8007,106.7203),
    ('t3@d.com','Le Van Cuong','0900000103','APPROVED','OFFLINE','CAR','59C10003',10.8014,106.7206),
    ('t4@d.com','Pham Van Dung','0900000104','PENDING_APPROVAL','OFFLINE','BIKE','59D10004',10.8021,106.7209),
    ('t5@d.com','Vo Van Em','0900000105','REJECTED','OFFLINE','BIKE','59E10005',10.8028,106.7212),
]
# Parameterized SQL qua pool của từng service; chỉ script local có quyền quản trị.
QUERY = """const fs=require('fs');const {pool}=require('./src/config/database');
(async()=>{const q=JSON.parse(fs.readFileSync(0,'utf8'));try{
if(q.account){const bcrypt=require('bcryptjs');q.params[1]=await bcrypt.hash('123',Number(process.env.BCRYPT_ROUNDS||10));}
const r=await pool.query(q.sql,q.params);console.log(JSON.stringify(r.rows));
}catch(e){console.error('Database operation failed: '+(e.code||'unknown'));process.exitCode=1;}finally{await pool.end();}})();"""


def sql(service, statement, params=None, account=False):
    result = subprocess.run(['docker','compose','exec','-T',service+'-service','node','-e',QUERY],
        cwd=ROOT,input=json.dumps({'sql':statement,'params':params or [],'account':account}),
        text=True,capture_output=True,encoding='utf-8')
    if result.returncode:
        code = re.search(r'Database operation failed: ([A-Z0-9]+)',result.stderr)
        raise RuntimeError('DỪNG: thao tác DB '+service+' thất bại ('+(code[1] if code else 'unknown')+'); không in thông tin nhạy cảm.')
    return json.loads(result.stdout)


def api(method, path, body=None, token=None, expected=200):
    for attempt in range(8):
        headers = {'Content-Type':'application/json'}
        if token:
            headers['Authorization'] = 'Bearer '+token
        req = urllib.request.Request('http://localhost:8080/api'+path,method=method,headers=headers,
            data=None if body is None else json.dumps(body).encode())
        try:
            response = urllib.request.urlopen(req,timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        result = json.loads(response.read())
        if response.code == 429:
            time.sleep(min(11,max(1,int(response.headers.get('Retry-After','10'))))+.2)
            continue
        if response.code != expected:
            raise RuntimeError('DỪNG: '+path+' HTTP '+str(response.code)+'; giữ nguyên dữ liệu để kiểm tra.')
        return result
    raise RuntimeError('DỪNG: rate limit chưa hết sau thời gian chờ giới hạn.')


def active(did):
    trips = sql('trip',"SELECT tid,bid,s FROM trip WHERE did=$1 AND s NOT IN ('COMPLETED','CANCELED')",[did])
    assignments = sql('booking','SELECT bid FROM driver_assignment WHERE did=$1',[did])
    if assignments:
        terminals = {r['bid'] for r in sql('trip',"SELECT bid FROM trip WHERE did=$1 AND s IN ('COMPLETED','CANCELED')",[did])}
        represented = terminals | {r['bid'] for r in trips}
        if any(a['bid'] not in represented for a in assignments):
            raise RuntimeError('DỪNG: Driver '+str(did)+' có assignment chờ Trip; không sửa trạng thái.')
    return trips


def prepare(apply=False, backup_user=None):
    planned = []
    for email,name,phone,ap,av,vt,plate,lat,lng in DRIVERS:
        accounts = sql('auth','SELECT uid,role,s,registration_done FROM user_account WHERE email=$1',[email])
        uid = accounts[0]['uid'] if accounts else None
        if accounts and (accounts[0]['role'] != 'DRIVER' or not accounts[0]['registration_done']):
            raise RuntimeError('DỪNG: tài khoản '+email+' không phải Driver demo hoàn chỉnh.')
        rows = sql('driver','SELECT d.did,d.uid,d.av,p.name,p.phone,v.vid,v.plate,v.vt FROM driver d JOIN driver_profile p USING(did) JOIN vehicle v USING(did) WHERE d.uid=$1 OR p.phone=$2 OR upper(btrim(v.plate))=$3',[uid,phone,plate])
        if uid and not rows and sql('driver','SELECT did FROM driver WHERE uid=$1',[uid]):
            raise RuntimeError('DỪNG: hồ sơ '+email+' đang thiếu Profile/Vehicle; cần kiểm tra thủ công.')
        if rows and (len(rows)!=1 or str(rows[0]['uid'])!=str(uid) or rows[0]['phone']!=phone or rows[0]['plate']!=plate or rows[0]['name']!=name or rows[0]['vt']!=vt):
            raise RuntimeError('DỪNG: email/phone/plate/hồ sơ xung đột: '+email+'; không ghi đè.')
        trips = active(rows[0]['did']) if rows else []
        if rows and str(rows[0]['did']) == '52':
            raise RuntimeError('DỪNG: không được sửa Driver 52.')
        if trips and (email!='t2@d.com' or len(trips)!=1 or rows[0]['av']!='BUSY'):
            raise RuntimeError('DỪNG: '+email+' còn chuyến mở; hoàn tất/hủy bằng API trước, không ép availability.')
        planned.append({'email':email,'uid':uid,'existing':rows,'active':trips})
    print('PASS kiểm tra trước: 5 định danh không xung đột; không sửa Driver ngoài nhóm.',flush=True)
    if not apply:
        print('Chỉ kiểm tra. Dùng --apply để backup và chuẩn bị dữ liệu.')
        return
    config = json.loads(subprocess.check_output(['docker','compose','config','--format','json'],cwd=ROOT))
    db_user = backup_user or config['services']['postgres']['environment']['POSTGRES_USER']
    backup = ROOT/'.backups'/('demo-drivers-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(parents=True)
    for database in ['auth_db','driver_db','booking_db','trip_db','payment_db']:
        with (backup/(database+'.dump')).open('wb') as file:
            result = subprocess.run(['docker','compose','exec','-T','postgres','pg_dump','-U',db_user,'-d',database,'--format=custom'],cwd=ROOT,stdout=file,stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('DỪNG: backup '+database+' thất bại, chưa ghi dữ liệu.')
    print('PASS backup 5 DB trong .backups/ (gitignored).',flush=True)
    admins = sql('auth',"SELECT uid FROM user_account WHERE email='a@a.com' AND role='ADMIN' AND s='ACTIVE'")
    if len(admins)!=1:
        raise RuntimeError('DỪNG: thiếu Admin demo để ghi người duyệt hồ sơ.')
    final = []
    for spec, plan in zip(DRIVERS,planned):
        email,name,phone,ap,av,vt,plate,lat,lng = spec
        if plan['existing'] and active(plan['existing'][0]['did']) != plan['active']:
            raise RuntimeError('DỪNG: Trip demo vừa thay đổi, chưa ghi Driver.')
        uid = sql('auth',"INSERT INTO user_account(email,pw_hash,role,s) VALUES($1,$2,'DRIVER','INACTIVE') ON CONFLICT(email) DO UPDATE SET pw_hash=EXCLUDED.pw_hash,u_at=CURRENT_TIMESTAMP RETURNING uid",[email,None],account=True)[0]['uid']
        # Một CTE nguyên tử cho Driver/Profile/Vehicle/Application/Location; DB tự cấp ID.
        changed = sql('driver',"""WITH d AS (
          INSERT INTO driver(uid,ap,av) VALUES($1,$2,$3) ON CONFLICT(uid) DO UPDATE SET ap=EXCLUDED.ap,av=EXCLUDED.av,u_at=CASE WHEN driver.av='BUSY' THEN driver.u_at ELSE CURRENT_TIMESTAMP END
          WHERE driver.av=$11 RETURNING did,uid
        ), p AS (
          INSERT INTO driver_profile(did,name,phone) SELECT did,$4,$5 FROM d ON CONFLICT(did) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone RETURNING did
        ), v AS (
          INSERT INTO vehicle(did,vt,plate) SELECT did,$6,$7 FROM d ON CONFLICT(plate) DO UPDATE SET vt=EXCLUDED.vt RETURNING vid,did
        ), a AS (
          INSERT INTO driver_application(did,vid,s,rev_uid,rev_at) SELECT d.did,v.vid,$2,
          CASE WHEN $2='PENDING_APPROVAL' THEN NULL ELSE $10::bigint END,
          CASE WHEN $2='PENDING_APPROVAL' THEN NULL ELSE CURRENT_TIMESTAMP END FROM d JOIN v USING(did)
          WHERE NOT EXISTS(SELECT 1 FROM driver_application old WHERE old.did=d.did) RETURNING appid
        ), l AS (
          INSERT INTO driver_location(did,lat,lng) SELECT did,$8,$9 FROM d ON CONFLICT(did) DO UPDATE SET lat=EXCLUDED.lat,lng=EXCLUDED.lng,rec_at=CURRENT_TIMESTAMP RETURNING did
        ) SELECT d.did,d.uid,v.vid FROM d JOIN v USING(did)""",
          [uid,ap,'BUSY' if plan['active'] else ('AVAILABLE' if av=='BUSY' else av),name,phone,vt,plate,lat,lng,
           admins[0]['uid'],plan['existing'][0]['av'] if plan['existing'] else None])
        if not changed:
            raise RuntimeError('DỪNG: availability vừa đổi; không ghi đè Driver '+email)
        row = changed[0]
        sql('driver',"UPDATE driver_application SET s=$2,rev_uid=CASE WHEN $2='PENDING_APPROVAL' THEN NULL ELSE $3::bigint END,rev_at=CASE WHEN $2='PENDING_APPROVAL' THEN NULL ELSE CURRENT_TIMESTAMP END WHERE did=$1 AND s<>$2",[row['did'],ap,admins[0]['uid']])
        sql('auth',"UPDATE user_account SET s='ACTIVE' WHERE uid=$1 AND role='DRIVER'",[uid])
        row.update({'email':email,'name':name,'phone':phone,'ap':ap,'av':av,'vt':vt,'plate':plate,'lat':lat,'lng':lng})
        final.append(row)
    # Tạo BUSY từ flow thật; không INSERT Trip giả hoặc sửa Booking cũ.
    second = final[1]
    if not planned[1]['active']:
        customer = api('POST','/login',{'email':'c@c.com','pw':'123'})
        driver = api('POST','/login',{'email':second['email'],'pw':'123'})
        candidates = sql('driver',"""SELECT d.did FROM driver d JOIN vehicle v USING(did) JOIN driver_location l USING(did)
          WHERE d.ap='APPROVED' AND d.av='AVAILABLE' AND v.vt='CAR' AND v.s='ACTIVE'
          ORDER BY ST_Distance(ST_SetSRID(ST_MakePoint(l.lng,l.lat),4326)::geography,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography),d.did LIMIT 1""",[second['lat'],second['lng']])
        if not candidates or candidates[0]['did']!=second['did']:
            raise RuntimeError('DỪNG: CAR khác được ưu tiên hơn t2; không tạo Booking.')
        booking = api('POST','/bookings',{'p':{'lat':second['lat'],'lng':second['lng']},'d':{'lat':10.81,'lng':106.73},'vt':'CAR'},customer['Token'],201)
        if booking['Driver ID']!=int(second['did']):
            raise RuntimeError('DỪNG: Offer không thuộc t2; chưa accept.')
        api('POST','/offers/'+str(booking['Offer ID'])+'/accept',token=driver['Token'])
        for _ in range(20):
            trips = sql('trip',"SELECT tid,bid,s FROM trip WHERE did=$1 AND s NOT IN ('COMPLETED','CANCELED')",[second['did']])
            if trips:
                break
            time.sleep(.5)
        else:
            raise RuntimeError('DỪNG: assignment đã nhận nhưng Trip chưa xuất hiện; không tạo thêm.')
        second['busyTrip'] = trips[0]
    else:
        second['busyTrip'] = planned[1]['active'][0]
    admin = api('POST','/login',{'email':'a@a.com','pw':'123'})
    nearby = api('GET','/drivers/nearby?lat=10.80&lng=106.72&r=1&page=1&limit=5',token=admin['Token'])
    if [r['Driver ID'] for r in nearby['Items']] != [int(r['did']) for r in final]:
        raise RuntimeError('DỪNG: page 1 bị Driver khác xen vào; giữ nguyên họ, không sửa Nearby.')
    (backup/'result.json').write_text(json.dumps({'drivers':final,'nearby':nearby},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'drivers':final,'nearby':nearby},ensure_ascii=False,indent=2),flush=True)
    print('PASS: 5 Driver demo; t2 BUSY có Trip thật; chạy lại không tạo thêm tài khoản/chuyến.',flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--backup-user',help='Superuser hiện có cho pg_dump; không phải mật khẩu')
    args = parser.parse_args()
    try:
        prepare(args.apply,args.backup_user)
    except (RuntimeError,subprocess.CalledProcessError,urllib.error.URLError) as error:
        raise SystemExit(str(error))
