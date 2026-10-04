'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomInt,randomUUID}=require('node:crypto');
const {pool,closeDatabase}=require('../src/config/database');
const {createPaymentService}=require('../src/services/payment.service');
const created=[],events=[],service=createPaymentService({publish:async row=>events.push(row.pid)});
const context={actorUserId:'900003',actorRole:'CUSTOMER'};
async function payment(){const p={bookingId:String(810000000000+randomInt(100000000)),customerId:'900000',customerUserId:'900003',createdAt:new Date().toISOString()};const result=await service.bookingCreated(p);created.push(result.paymentId);return {p,result};}
after(async()=>{if(created.length)await pool.query('DELETE FROM payment WHERE pid=ANY($1::bigint[])',[created]);await closeDatabase();});
test('real payment_db: duplicate Booking concurrent deliveries yield one PENDING Payment',async()=>{
 const {p,result}=await payment();const again=await Promise.all([service.bookingCreated(p),service.bookingCreated(p)]);assert.ok(again.every(r=>r.paymentId===result.paymentId));
 const row=(await pool.query('SELECT * FROM payment WHERE pid=$1',[result.paymentId])).rows[0];assert.equal(row.amt,'50000.00');assert.equal(row.eligible,false);assert.equal(row.tid,null);assert.equal(row.ikey,null);
});
test('real payment_db: concurrent same-key pay/callback serialize into one completion/event',async()=>{
 const {p,result}=await payment();await service.tripCompleted({...p,tripId:p.bookingId});const key='integration-'+randomUUID(),request={context,paymentId:result.paymentId,idempotencyKey:key};
 await Promise.all([service.payExistingPayment(request),service.payExistingPayment(request)]);
 await Promise.all([service.paymentCallback({context,paymentId:result.paymentId,status:'COMPLETED'}),service.paymentCallback({context,paymentId:result.paymentId,status:'COMPLETED'})]);
 assert.equal((await service.payExistingPayment(request)).paymentId,result.paymentId);assert.equal(events.filter(id=>String(id)===result.paymentId).length,1);
 const other=await payment();await service.tripCompleted({...other.p,tripId:other.p.bookingId});
 await assert.rejects(service.payExistingPayment({...request,paymentId:other.result.paymentId}),{statusCode:409});
 assert.equal((await pool.query('SELECT ikey FROM payment WHERE pid=$1',[other.result.paymentId])).rows[0].ikey,null);
});
