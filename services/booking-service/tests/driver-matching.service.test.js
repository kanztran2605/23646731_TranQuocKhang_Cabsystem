'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {fixture,input,AppError}=require('./fixture');
test('matching queries current Driver contract with demo radius and candidate limit',async()=>{
 const f=fixture();await f.service.createBooking(input());
 assert.deepEqual(f.state.searches,[{pickupLatitude:10.76,pickupLongitude:106.68,radiusKm:1,vehicleType:'CAR',limit:20,correlationId:'booking-test'}]);
});
test('nearest matching vehicle is selected; exactly one Offer is committed before event',async()=>{
 const f=fixture();f.state.candidates=[
 {userId:'12',driverId:'3',vehicleId:'3',vehicleType:'BIKE',distanceKm:0.01},
 {userId:'12',driverId:'9',vehicleId:'9',vehicleType:'CAR',distanceKm:0.4},
 {userId:'12',driverId:'7',vehicleId:'7',vehicleType:'CAR',distanceKm:0.1},
 {userId:'12',driverId:'1',vehicleId:'1',vehicleType:'CAR',distanceKm:2}];
 await f.service.createBooking(input());assert.equal(f.state.offers.length,1);assert.equal(f.state.offers[0].did,'7');
 assert.deepEqual(f.state.operations.slice(-3),['offer.persist','commit','offer.created']);
});
test('repeated matching does not query or publish another Offer',async()=>{
 const f=fixture();await f.service.createBooking(input());
 await f.matching.startMatching({booking:f.state.bookings[0],correlationId:'booking-test'});
 assert.equal(f.state.searches.length,1);assert.equal(f.state.offers.length,1);assert.equal(f.state.events.length,2);
});
test('equal distance uses deterministic Driver ID ordering',async()=>{
 const f=fixture();f.state.candidates=[{userId:'12',driverId:'10',vehicleId:'10',vehicleType:'CAR',distanceKm:0.1},{userId:'12',driverId:'2',vehicleId:'2',vehicleType:'CAR',distanceKm:0.1}];
 await f.service.createBooking(input());assert.equal(f.state.offers[0].did,'2');
});
test('terminal result is retained without timers or matching attempts',async(t)=>{
 const f=fixture();f.state.candidates=[];await f.service.createBooking(input());
 t.mock.method(global,'setTimeout',()=>assert.fail('MVP must not start automatic matching timers'));
 await f.matching.startMatching({booking:f.state.bookings[0]});assert.equal(f.state.searches.length,1);assert.equal(f.state.offers.length,0);
});
test('Driver lookup failure is propagated without marking false NO_DRIVER_FOUND or retrying',async()=>{
 const f=fixture();f.state.searchError=new AppError('Unavailable',{statusCode:503});
 await assert.rejects(f.service.createBooking(input()),{statusCode:503});
 assert.equal(f.state.bookings[0].s,'SEARCHING');assert.equal(f.state.searches.length,1);assert.equal(f.state.offers.length,0);
});
test('Offer publication failure retains one persisted Offer and reports failure',async()=>{
 const f=fixture();f.state.publishFailure='offer.created';
 await assert.rejects(f.service.createBooking(input()),{statusCode:503});assert.equal(f.state.offers.length,1);
});
