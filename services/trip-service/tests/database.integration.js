'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomInt}=require('node:crypto');
const {pool,withTransaction,closeDatabase}=require('../src/config/database');
const {createTripService}=require('../src/services/trip.service');
const created=[],events=[];
const service=createTripService({publish:async(type,row)=>events.push({type,tid:row.tid})});
const payload=()=>({bookingId:String(800000000000+randomInt(100000000)),customerId:'900000',driverId:'900001',vehicleId:'900002',customerUserId:'900003',driverUserId:'900004',acceptedAt:new Date().toISOString()});
after(async()=>{if(created.length)await pool.query('DELETE FROM trip WHERE tid=ANY($1::bigint[])',[created]);await closeDatabase();});
test('real trip_db: concurrent assignment redelivery yields one Trip/initial history/event',async()=>{
 const p=payload();const responses=await Promise.all([service.assigned(p),service.assigned(p)]);created.push(responses[0].tripId);
 assert.equal(responses[0].tripId,responses[1].tripId);assert.equal(responses[0].paid,false);
 assert.equal((await pool.query('SELECT count(*) FROM trip_status_history WHERE tid=$1',[responses[0].tripId])).rows[0].count,'1');assert.equal(events.filter(e=>String(e.tid)===responses[0].tripId).length,1);
});
test('real trip_db: transitions/history atomic, location constraints and paid projection preserve status',async()=>{
 const result=await service.assigned(payload());created.push(result.tripId);const context={actorUserId:'900004',actorRole:'DRIVER'};
 for(const status of ['ARRIVED','IN_PROGRESS','COMPLETED'])await service.updateTripStatus({context,tripId:result.tripId,status});
 const row=(await pool.query('SELECT * FROM trip WHERE tid=$1',[result.tripId])).rows[0];assert.equal(row.s,'COMPLETED');assert.equal(row.paid,false);
 await service.paymentCompleted({tripId:row.tid,bookingId:row.bid,customerId:row.cid,recipientUserIds:[row.customer_uid]});await service.paymentCompleted({tripId:row.tid,bookingId:row.bid,customerId:row.cid,recipientUserIds:[row.customer_uid]});
 assert.equal((await service.getTrip({context,tripId:row.tid})).paid,true);
 assert.equal((await pool.query('SELECT count(*) FROM trip_status_history WHERE tid=$1',[row.tid])).rows[0].count,'4');
 await assert.rejects(pool.query('INSERT INTO trip_location(tid,lat,lng) VALUES($1,91,0)',[row.tid]),{code:'23514'});
 const before=await pool.query('SELECT count(*) FROM trip_status_history WHERE tid=$1',[row.tid]);
 await assert.rejects(withTransaction(async client=>{await client.query("INSERT INTO trip_status_history(tid,to_s) VALUES($1,'CANCELED')",[row.tid]);throw new Error('rollback');}));
 assert.deepEqual((await pool.query('SELECT count(*) FROM trip_status_history WHERE tid=$1',[row.tid])).rows,before.rows);
});
