"""Local demo only: back up Notification MongoDB and migrate to UNIQUE (eid,uid).

Uses existing container environment credentials, prints none. Preserves documents;
normalizes numeric uid to the canonical string scalar and archives exact duplicate
documents before removing only redundant copies. Conflicting duplicates stop.
"""
import datetime
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
backups = ROOT / '.backups'
backups.mkdir(exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
archive = '/tmp/cab-notification-' + stamp + '.archive.gz'
dump = subprocess.run(['docker','exec','cab-mongodb','sh','-c',
    'mongodump --archive=' + archive + ' --gzip --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$MONGO_INITDB_DATABASE"'],capture_output=True)
if dump.returncode:
    raise SystemExit('Mongo backup failed; no documents/indexes modified')
target = backups / Path(archive).name
copy = subprocess.run(['docker','cp','cab-mongodb:' + archive,str(target)],capture_output=True)
if copy.returncode or not target.stat().st_size:
    raise SystemExit('Mongo backup copy failed; no index changes')
print('Backup saved:', target)
script = r'''
const auth=db.getSiblingDB('admin').auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD);
if(!auth.ok) throw new Error('Authentication failed');
const ndb=db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'notification_db');
const c=ndb.notifications;
const rows=c.find().toArray(), groups=new Map();
for(const row of rows) {
  const uid=String(row.uid);
  if(!/^[1-9][0-9]*$/.test(uid) || !row.eid) throw new Error('Invalid existing identity; stop');
  const key=row.eid+':'+uid;
  if(!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(row);
}
const redundant=[];
for(const group of groups.values()) {
  const canonical=group[0];
  const signature=row=>JSON.stringify(Object.fromEntries(Object.entries({...row,uid:String(row.uid)}).filter(([k])=>k!=='_id')));
  for(const row of group.slice(1)) {
    if(signature(row)!==signature(canonical)) throw new Error('Conflicting duplicate identity; stop before changes');
    redundant.push(row);
  }
}
for(const row of redundant) {
  ndb.legacy_notification_duplicates.updateOne({_id:row._id},{$setOnInsert:row},{upsert:true});
  c.deleteOne({_id:row._id});
}
for(const row of c.find().toArray()) if(typeof row.uid!=='string') c.updateOne({_id:row._id},{$set:{uid:String(row.uid)}});
// Establish the new protection before removing only the obsolete eid-only index.
c.createIndex({eid:1,uid:1},{unique:true,name:'uq_notification_eid_uid'});
for(const index of c.getIndexes()) if(index.unique && Object.keys(index.key).length===1 && index.key.eid===1) c.dropIndex(index.name);
c.createIndex({uid:1,c_at:-1},{name:'idx_notification_uid_time'});
print(JSON.stringify({documents:c.countDocuments(),archivedDuplicates:redundant.length,indexes:c.getIndexes().map(i=>({name:i.name,key:i.key,unique:!!i.unique}))}));
'''
result = subprocess.run(['docker','exec','cab-mongodb','mongosh','--quiet','--eval',script],capture_output=True)
if result.returncode:
    raise SystemExit('Mongo migration failed; inspect private backup before retrying')
print('PASS Notification data preserved; compound dedup index installed')
