'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,input,customerContext,driverContext,AppError}=require('./fixture');
test('valid creation validates Customer, persists SEARCHING, emits booking.created, then matches',async()=>{
 const f=fixture(),r=await f.service.createBooking(input());
 assert.equal(r.vehicleType,'CAR'); assert.equal(r.status,'SEARCHING'); assert.equal(r.offerId,'8');
 assert.deepEqual(f.state.customerCalls,[{userId:'10',correlationId:'booking-test'}]);
 assert.equal(f.state.bookings[0].cid,'2');
 assert.ok(f.state.operations.indexOf('booking.persist')<f.state.operations.indexOf('booking.created'));
 assert.ok(f.state.operations.indexOf('booking.created')<f.state.operations.indexOf('offer.persist'));
 assert.equal(f.state.events[0].input.createdAt,'2026-10-04T10:00:00.000Z');
});
test('invalid Customer prevents persistence and events',async()=>{
 const f=fixture();f.state.customerError=AppError.notFound();
 await assert.rejects(f.service.createBooking(input()),{statusCode:404});
 assert.equal(f.state.bookings.length,0); assert.equal(f.state.events.length,0);
});
test('missing Customer and mismatched user identity cannot create Booking',async()=>{
 for(const config of [{customerMissing:true},{customerUserId:'99'}]){
  const f=fixture();Object.assign(f.state,config);
  await assert.rejects(f.service.createBooking(input()),e=>[403,404].includes(e.statusCode));
  assert.equal(f.state.bookings.length,0);
 }
});
for(const [label,patch] of [
 ['missing pickup',{pickup:undefined}],['missing destination',{destination:undefined}],
 ['out of range latitude',{pickup:{latitude:91,longitude:106}}],['invalid longitude',{destination:{latitude:10,longitude:-181}}],
 ['non-numeric coordinate',{pickup:{latitude:'10',longitude:106}}],['missing vehicle type',{vehicleType:undefined}],
 ['numeric vehicle type',{vehicleType:'1'}],['NaN latitude',{pickup:{latitude:NaN,longitude:106}}],
]) test('creation rejects '+label,async()=>{const f=fixture();await assert.rejects(f.service.createBooking({...input(),...patch}),{statusCode:400});assert.equal(f.state.bookings.length,0);assert.equal(f.state.events.length,0);});
test('creation ignores a public customer ID and rejects inconsistent actor Customer context',async()=>{
 const f=fixture();await f.service.createBooking({...input(),customerId:'99'});
 assert.equal(f.state.bookings[0].cid,'2');
 await assert.rejects(f.service.createBooking({...input(),context:{...customerContext,actorCustomerId:'99'}}),{statusCode:403});
});
test('missing actor and Driver actor cannot create Customer Booking',async()=>{
 for(const context of [undefined,driverContext]){const f=fixture();await assert.rejects(f.service.createBooking({...input(),context}),e=>[401,403].includes(e.statusCode));assert.equal(f.state.bookings.length,0);}
});
test('booking.created publisher failure keeps saved Booking, reports failure and skips matching',async()=>{
 const f=fixture();f.state.publishFailure='booking.created';
 await assert.rejects(f.service.createBooking(input()),{statusCode:503});
 assert.equal(f.state.bookings.length,1);assert.equal(f.state.searches.length,0);assert.equal(f.state.offers.length,0);
});
test('no eligible Driver keeps Booking without Offer/Assignment and publishes only booking.created',async()=>{
 const f=fixture();f.state.candidates=[];
 const r=await f.service.createBooking(input());assert.equal(r.status,'NO_DRIVER_FOUND');
 assert.equal(f.state.offers.length,0);assert.equal(f.state.assignments.length,0);
 assert.deepEqual(f.state.events.map(e=>e.type),['booking.created']);
});
test('Customer reads own Booking and cannot read another Customer Booking',async()=>{
 const f=fixture();await f.service.createBooking(input());
 assert.equal((await f.service.getBooking({context:customerContext,bookingId:'20'})).customerId,'2');
 f.state.bookings[0].cid='99';
 await assert.rejects(f.service.getBooking({context:customerContext,bookingId:'20'}),{statusCode:403});
});
test('get Booking not found and SQL injection identifier are rejected',async()=>{
 const f=fixture();
 await assert.rejects(f.service.getBooking({context:customerContext,bookingId:'20'}),{statusCode:404});
 await assert.rejects(f.service.getBooking({context:customerContext,bookingId:"1 OR 1=1"}),{statusCode:400});
});
test('Customer history is paged and contains only owned Bookings',async()=>{
 const f=fixture();await f.service.createBooking(input());
 for(let i=21;i<26;i++)f.state.bookings.push({...f.state.bookings[0],bid:String(i),cid:i===25?'99':'2'});
 const r=await f.service.listMyBookings({context:customerContext,page:2,limit:2});
 assert.equal(r.total,5);assert.equal(r.items.length,2);assert.ok(r.items.every(b=>b.customerId==='2'));
 assert.deepEqual(f.state.listInput,{customerId:'2',page:2,limit:2});
 await assert.rejects(f.service.listMyBookings({context:customerContext,page:-1,limit:2}),{statusCode:400});
});
test('Driver views only own OPEN Offers and related Booking',async()=>{
 const f=fixture();await f.service.createBooking(input());
 assert.equal((await f.service.listMyOffers({context:driverContext})).items[0].offerId,'8');
 assert.equal((await f.service.getBooking({context:driverContext,bookingId:'20'})).bookingId,'20');
 f.state.driver.driverId='99';
 assert.deepEqual((await f.service.listMyOffers({context:driverContext})).items,[]);
 await assert.rejects(f.service.getBooking({context:driverContext,bookingId:'20'}),{statusCode:403});
});
test('another Driver cannot accept Offer',async()=>{
 const f=fixture();await f.service.createBooking(input());f.state.driver.driverId='99';
 await assert.rejects(f.service.acceptOffer({context:driverContext,offerId:'8'}),{statusCode:403});
 assert.equal(f.state.assignments.length,0);assert.equal(f.state.busyCalls.length,0);
});
test('missing Offer is NOT_FOUND',async()=>{
 const f=fixture();await assert.rejects(f.service.acceptOffer({context:driverContext,offerId:'8'}),{statusCode:404});
});
test('acceptance reserves Driver before local persistence and publishes only after commit',async()=>{
 const f=fixture();await f.service.createBooking(input());
 const r=await f.service.acceptOffer({context:driverContext,offerId:'8'});
 assert.deepEqual(r,{offerId:'8',bookingId:'20',offerStatus:'ACCEPTED',tripPending:true});
 assert.equal(f.state.driver.availabilityStatus,'BUSY');assert.equal(f.state.assignments.length,1);
 assert.equal(f.state.bookings[0].s,'ASSIGNED');assert.ok(f.state.bookings[0].ass_at);
 const ops=f.state.operations;assert.ok(ops.indexOf('driver.busy')<ops.indexOf('offer.accept'));
 assert.ok(ops.indexOf('offer.accept')<ops.indexOf('assignment.persist'));
 assert.equal(ops.at(-2),'commit');assert.equal(ops.at(-1),'driver.accepted');
 assert.equal(f.state.events.at(-1).input.vehicleId,'9');
});
test('duplicate acceptance returns same result without new assignment, state transition or event',async()=>{
 const f=fixture();await f.service.createBooking(input());
 const first=await f.service.acceptOffer({context:driverContext,offerId:'8'});
 assert.deepEqual(await f.service.acceptOffer({context:driverContext,offerId:'8'}),first);
 assert.equal(f.state.assignments.length,1);assert.equal(f.state.busyCalls.length,1);
 assert.equal(f.state.events.filter(e=>e.type==='driver.accepted').length,1);
});
test('MarkBusy conflict rolls back without accepting Offer, Assignment or success event',async()=>{
 const f=fixture();await f.service.createBooking(input());f.state.busyError=AppError.conflict();
 await assert.rejects(f.service.acceptOffer({context:driverContext,offerId:'8'}),{statusCode:409});
 assert.equal(f.state.offers[0].s,'OPEN');assert.equal(f.state.bookings[0].s,'SEARCHING');
 assert.equal(f.state.assignments.length,0);assert.equal(f.state.events.filter(e=>e.type==='driver.accepted').length,0);
});
test('non-eligible Driver state rejects OPEN Offer without reserving',async()=>{
 for(const patch of [{approvalStatus:'REJECTED'},{approvalStatus:'PENDING_APPROVAL'},{availabilityStatus:'OFFLINE'},{availabilityStatus:'BUSY'}]){
  const f=fixture();await f.service.createBooking(input());Object.assign(f.state.driver,patch);
  await assert.rejects(f.service.acceptOffer({context:driverContext,offerId:'8'}),{statusCode:409});
  assert.equal(f.state.busyCalls.length,0);assert.equal(f.state.assignments.length,0);
 }
});
test('terminal Booking and existing Assignment prevent new reservation',async()=>{
 const f=fixture();await f.service.createBooking(input());f.state.bookings[0].s='NO_DRIVER_FOUND';
 await assert.rejects(f.service.acceptOffer({context:driverContext,offerId:'8'}),{statusCode:409});
 f.state.bookings[0].s='SEARCHING';f.state.assignments.push({aid:'1'});
 await assert.rejects(f.service.acceptOffer({context:driverContext,offerId:'8'}),{statusCode:409});assert.equal(f.state.busyCalls.length,0);
});
test('assignment SQL failure rolls back local records and exposes no success event',async()=>{
 const f=fixture();await f.service.createBooking(input());f.repo.createAssignment=async()=>{throw Object.assign(new Error('internal sql'),{code:'23505'});};
 await assert.rejects(f.service.acceptOffer({context:driverContext,offerId:'8'}),{statusCode:409});
 assert.equal(f.state.offers[0].s,'OPEN');assert.equal(f.state.assignments.length,0);
 assert.equal(f.state.events.filter(e=>e.type==='driver.accepted').length,0);
});
