'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createNotificationService,POLICY}=require('../src/services/notification.service');
const {createNotificationRepository}=require('../src/repositories/notification.repository');
const {serve}=require('../../../shared/tests/grpc-service');
const {createNotificationGrpcHandlers}=require('../src/grpc/notification.grpc');
function event(type,recipients=['13']) {
 const payload={offerId:'1',bookingId:'20',driverId:'8',tripId:'1',paymentId:'1',customerId:'3',userId:'14',recipientUserIds:recipients,
  createdAt:'2026-10-04T10:00:00Z',approvalStatus:'APPROVED',changedAt:'2026-10-04T10:00:00Z',fromStatus:'ASSIGNED',toStatus:'ARRIVED',reason:'x',canceledAt:'2026-10-04T10:00:00Z',amount:50000,paidAt:'2026-10-04T10:00:00Z'};
 return {eventId:randomUUID(),eventType:type,occurredAt:'2026-10-04T10:00:00Z',payload};
}
function fixture(){const rows=[];const repo={async save(row){if(!rows.some(r=>r.eid===row.eid&&r.uid===row.uid))rows.push({...row,_id:String(rows.length+1)});},async list(uid,limit){return rows.filter(r=>r.uid===uid).slice(0,limit);}};return {rows,repo,service:createNotificationService(repo)};}
for(const type of Object.keys(POLICY))test(type+' persists correct User recipient/type/reference and original event ID',async()=>{
 const f=fixture(),e=event(type,['14']);await f.service.consume(e);assert.equal(f.rows.length,1);assert.equal(f.rows[0].uid,'14');assert.equal(f.rows[0].eid,e.eventId);assert.equal(f.rows[0].s,'SENT');assert.equal(f.rows[0].type,POLICY[type][0]);
});
test('cancellation fans out to two distinct users; replay creates nothing new',async()=>{
 const f=fixture(),e=event('trip.canceled',['13','14','13']);await f.service.consume(e);await f.service.consume(e);
 assert.deepEqual(f.rows.map(r=>r.uid),['13','14']);assert.ok(f.rows.every(r=>r.eid===e.eventId));
});
test('different events may notify the same user',async()=>{const f=fixture();await f.service.consume(event('offer.created'));await f.service.consume(event('offer.created'));assert.equal(f.rows.length,2);});
test('recipient identity is required; never infer from Customer/Driver IDs',async()=>{
 const f=fixture();for(const recipients of [[],undefined,['0'],[13]]){const e=event('offer.created');e.payload.recipientUserIds=recipients;await assert.rejects(f.service.consume(e));}assert.equal(f.rows.length,0);
});
test('unsupported events and invalid envelope are rejected without Mongo writes',async()=>{
 const f=fixture();for(const type of ['booking.created','driver.accepted','trip.completed'])await assert.rejects(f.service.consume(event(type)),{statusCode:400});
 const e=event('offer.created');e.eventId='invalid';await assert.rejects(f.service.consume(e));assert.equal(f.rows.length,0);
});
test('list only authenticated current User; limit works and credentialless requests rejected',async()=>{
 const f=fixture();await f.service.consume(event('trip.canceled',['13','14']));const response=await f.service.listNotifications({context:{actorUserId:'13',actorRole:'CUSTOMER'},limit:1});
 assert.equal(response.items.length,1);assert.equal(response.items[0].recipientUserId,'13');assert.equal(response.items[0].reference,'TRIP:1');
 await assert.rejects(f.service.listNotifications({context:{},limit:1}),{statusCode:401});
 await assert.rejects(f.service.listNotifications({context:{actorUserId:'13',actorRole:'CUSTOMER'},limit:21}),{statusCode:400});
});
test('Mongo repository performs conditional insert by (eid,uid), never overwrites delivery',async()=>{
 const writes=[];const repo=createNotificationRepository({async updateOne(filter,update,options){writes.push({filter,update,options});}});
 const row={eid:'E',uid:'13',msg:'local'};await repo.save(row);assert.deepEqual(writes,[{filter:{eid:'E',uid:'13'},update:{$setOnInsert:row},options:{upsert:true}}]);
});
test('Mongo repository ignores only duplicate race; propagates actual storage failures',async()=>{
 await createNotificationRepository({async updateOne(){throw Object.assign(new Error('duplicate'),{code:11000});}}).save({eid:'E',uid:'13'});
 await assert.rejects(createNotificationRepository({async updateOne(){throw new Error('unavailable');}}).save({eid:'E',uid:'13'}),/unavailable/);
});
test('real Notification gRPC list and HealthService',async t=>{
 const f=fixture();await f.service.consume(event('offer.created',['14']));const api=await serve(t,'notification.proto','cab.notification.v1','NotificationService',createNotificationGrpcHandlers(f.service));
 const result=await api.call('listNotifications',{context:{actorUserId:'14',actorRole:'DRIVER'},limit:5});assert.equal(result.items.length,1);assert.equal(result.items[0].recipientUserId,'14');assert.equal((await api.checkHealth()).status,'UP');
});
module.exports={event};
