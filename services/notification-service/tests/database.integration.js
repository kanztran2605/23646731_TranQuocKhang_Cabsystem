'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {database,checkDatabase,closeDatabase}=require('../src/config/database');
const {createNotificationRepository}=require('../src/repositories/notification.repository');
const ids=[],collection=database.collection('notifications'),repo=createNotificationRepository(collection);
after(async()=>{if(ids.length)await collection.deleteMany({eid:{$in:ids}});await closeDatabase();});
test('real notification Mongo: compound unique allows two recipients and prevents same-recipient duplicate',async()=>{
 await checkDatabase();const eid=randomUUID();ids.push(eid);const row={eid,uid:'900003',type:'TRIP_CANCELED',ref_t:'TRIP',ref_id:'999999',msg:'Trip canceled',s:'SENT',c_at:new Date()};
 await Promise.all([repo.save(row),repo.save(row),repo.save({...row,uid:'900004'})]);
 assert.equal(await collection.countDocuments({eid}),2);await assert.rejects(collection.insertOne(row),{code:11000});
 const indexes=await collection.indexes();assert.ok(indexes.some(i=>i.unique&&i.key.eid===1&&i.key.uid===1));assert.ok(!indexes.some(i=>i.unique&&Object.keys(i.key).length===1&&i.key.eid===1));
 assert.ok((await repo.list('900003',20)).every(r=>r.uid==='900003'));
});
