'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,customer,booking,completed}=require('./fixture');
const {createPaymentPublisher}=require('../src/events/payment.publisher');
const {validateEventEnvelope}=require('../../../shared/rabbitmq/publisher');
const {serve}=require('../../../shared/tests/grpc-service');
const {createPaymentGrpcHandlers}=require('../src/grpc/payment.grpc');
test('Booking event creates one Payment immediately: 50000/PENDING/ineligible/null Trip and key',async()=>{
 const f=fixture(),p=await f.service.bookingCreated(booking());assert.equal(p.amount,50000);assert.equal(p.status,'PENDING');assert.equal(p.eligible,false);
 assert.equal(f.state.rows[0].tid,null);assert.equal(f.state.rows[0].ikey,null);assert.equal(f.state.rows[0].customer_uid,'13');assert.equal(f.state.events.length,0);
});
test('duplicate Booking delivery reuses Payment; conflicting identity rejected',async()=>{
 const f=fixture(),first=await f.service.bookingCreated(booking()),again=await f.service.bookingCreated(booking());assert.equal(first.paymentId,again.paymentId);assert.equal(f.state.rows.length,1);
 await assert.rejects(f.service.bookingCreated({...booking(),customerUserId:'99'}),{statusCode:409});
});
test('Trip completion attaches tid and eligibility to same existing PENDING Payment',async()=>{
 const f=fixture();await f.service.bookingCreated(booking());const p=await f.service.tripCompleted(completed());assert.equal(p.paymentId,'1');assert.equal(p.tripId,'1');assert.equal(p.eligible,true);assert.equal(p.status,'PENDING');assert.equal(f.state.rows.length,1);
});
test('duplicate Trip completion is safe; a different Trip cannot replace attached tid',async()=>{
 const f=fixture();await f.eligible();await f.service.tripCompleted(completed());assert.equal(f.state.rows.length,1);
 await assert.rejects(f.service.tripCompleted({...completed(),tripId:'2'}),{statusCode:409});assert.equal(f.state.rows[0].tid,'1');
});
test('Trip completion never creates missing Payment',async()=>{
 const f=fixture();await assert.rejects(f.service.tripCompleted(completed()),{statusCode:404});assert.equal(f.state.rows.length,0);
});
test('Trip event must match Booking Customer and propagated UID',async()=>{
 const f=fixture();await f.service.bookingCreated(booking());for(const wrong of [{customerId:'99'},{customerUserId:'99'}])await assert.rejects(f.service.tripCompleted({...completed(),...wrong}),{statusCode:409});assert.equal(f.state.rows[0].eligible,false);
});
test('ineligible Payment cannot pay or complete callback',async()=>{
 const f=fixture();await f.service.bookingCreated(booking());await assert.rejects(f.service.payExistingPayment({...f.request(),idempotencyKey:'P1'}),{statusCode:409});
 await assert.rejects(f.service.paymentCallback({...f.request(),status:'COMPLETED'}),{statusCode:409});assert.equal(f.state.rows[0].ikey,null);assert.equal(f.state.events.length,0);
});
test('pay records P1 on eligible existing Payment and waits for mock callback',async()=>{
 const f=fixture();await f.eligible();const p=await f.service.payExistingPayment({...f.request(),idempotencyKey:'P1'});assert.equal(p.status,'PENDING');assert.equal(p.idempotencyKey,'P1');assert.equal(f.state.events.length,0);
});
test('callback completes only after local persistence/commit and publishes once',async()=>{
 const f=fixture();await f.eligible();await f.service.payExistingPayment({...f.request(),idempotencyKey:'P1'});f.state.operations=[];
 const p=await f.service.paymentCallback({...f.request(),status:'COMPLETED'});assert.equal(p.status,'COMPLETED');assert.ok(p.paidAt);assert.deepEqual(f.state.operations,['payment.complete','commit','payment.completed']);
});
test('P1 replay before and after callback returns same pid without double completion/event',async()=>{
 const f=fixture();await f.eligible();const req={...f.request(),idempotencyKey:'P1'};
 assert.equal((await f.service.payExistingPayment(req)).paymentId,'1');await f.service.payExistingPayment(req);
 await f.service.paymentCallback({...f.request(),status:'COMPLETED'});await f.service.paymentCallback({...f.request(),status:'COMPLETED'});
 const again=await f.service.payExistingPayment(req);assert.equal(again.paymentId,'1');assert.equal(again.status,'COMPLETED');assert.equal(f.state.rows.length,1);assert.equal(f.state.events.length,1);
});
test('same Payment with another key conflicts',async()=>{
 const f=fixture();await f.eligible();await f.service.payExistingPayment({...f.request(),idempotencyKey:'P1'});
 await assert.rejects(f.service.payExistingPayment({...f.request(),idempotencyKey:'P2'}),{statusCode:409});assert.equal(f.state.rows[0].ikey,'P1');
});
test('same key cannot identify a different Payment',async()=>{
 const f=fixture();await f.eligible();await f.service.payExistingPayment({...f.request(),idempotencyKey:'P1'});
 await f.service.bookingCreated({...booking(),bookingId:'21'});await f.service.tripCompleted({...completed(),bookingId:'21',tripId:'2'});
 await assert.rejects(f.service.payExistingPayment({...f.request(),paymentId:'2',idempotencyKey:'P1'}),{statusCode:409});assert.equal(f.state.rows[1].ikey,null);
});
test('get by Payment/Booking; ownership verifies UID rather than CID',async()=>{
 const f=fixture();await f.eligible();assert.equal((await f.service.getPaymentByBooking({context:customer,bookingId:'20'})).paymentId,'1');
 for(const op of ['getPayment','payExistingPayment','paymentCallback'])await assert.rejects(f.service[op]({...f.request(),context:{...customer,actorUserId:'3'},idempotencyKey:'P1',status:'COMPLETED'}),{statusCode:403});
 assert.equal((await f.service.getPayment({...f.request(),context:{actorUserId:'19',actorRole:'ADMIN'}})).paymentId,'1');
});
test('Driver cannot access Payment; missing context and IDs fail safely',async()=>{
 const f=fixture();await f.eligible();await assert.rejects(f.service.getPayment({...f.request(),context:{actorUserId:'14',actorRole:'DRIVER'}}),{statusCode:403});
 await assert.rejects(f.service.getPayment({...f.request(),context:{}}),{statusCode:401});await assert.rejects(f.service.getPayment({...f.request(),paymentId:'99'}),{statusCode:404});
 await assert.rejects(f.service.getPayment({...f.request(),paymentId:"' OR 1=1 --"}),{statusCode:400});
});
test('invalid callback and missing/oversized key rejected',async()=>{
 const f=fixture();await f.eligible();await assert.rejects(f.service.paymentCallback({...f.request(),status:'OTHER'}),{statusCode:400});
 for(const key of ['',undefined,'x'.repeat(101)])await assert.rejects(f.service.payExistingPayment({...f.request(),idempotencyKey:key}),{statusCode:400});
});
test('payment.completed payload/envelope retains correlation and Customer recipient',async()=>{
 const f=fixture();await f.eligible();await f.service.paymentCallback({...f.request(),status:'COMPLETED'});const events=[];
 await createPaymentPublisher(async e=>events.push(e))(f.state.events[0]);const e=events[0];validateEventEnvelope(e,e.eventType);
 assert.deepEqual(e.payload.recipientUserIds,['13']);assert.equal(e.payload.amount,50000);assert.equal(e.payload.bookingId,'20');assert.equal(e.correlationId,'payment-test');
});
test('real Payment gRPC contract and HealthService',async t=>{
 const f=fixture();await f.eligible();const api=await serve(t,'payment.proto','cab.payment.v1','PaymentService',createPaymentGrpcHandlers(f.service));
 assert.equal((await api.call('getPayment',f.request())).paymentId,'1');assert.equal((await api.call('payExistingPayment',{...f.request(),idempotencyKey:'P1'})).status,'PENDING');
 assert.equal((await api.call('paymentCallback',{...f.request(),status:'COMPLETED'})).status,'COMPLETED');assert.equal((await api.checkHealth()).status,'UP');
});
