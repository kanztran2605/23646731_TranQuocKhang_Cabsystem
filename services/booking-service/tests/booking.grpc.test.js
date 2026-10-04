'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {serve}=require('../../../shared/tests/grpc-service');
const {fixture,input,customerContext,driverContext,AppError}=require('./fixture');
const {createBookingGrpcHandlers}=require('../src/grpc/booking.grpc');
test('all five current Booking RPCs serialize canonical requests/responses and expose HealthService',async(t)=>{
 const f=fixture();let down=false;
 const rpc=await serve(t,'booking.proto','cab.booking.v1','BookingService',createBookingGrpcHandlers(f.service),async()=>{if(down)throw Error();});
 const b=await rpc.call('createBooking',input());assert.equal(b.status,'SEARCHING');assert.equal(b.vehicleType,'CAR');assert.equal(b.offerId,'8');
 assert.equal((await rpc.call('getBooking',{context:customerContext,bookingId:b.bookingId})).customerId,'2');
 assert.equal((await rpc.call('listMyBookings',{context:customerContext,page:1,limit:2})).items.length,1);
 assert.equal((await rpc.call('listMyOffers',{context:driverContext})).items[0].status,'OPEN');
 assert.equal((await rpc.call('acceptOffer',{context:driverContext,offerId:'8'})).offerStatus,'ACCEPTED');
 assert.equal((await rpc.checkHealth()).status,'UP');down=true;assert.equal((await rpc.checkHealth()).status,'DOWN');
});
test('Booking gRPC preserves validation, authentication, ownership and precondition errors',async(t)=>{
 const f=fixture(),rpc=await serve(t,'booking.proto','cab.booking.v1','BookingService',createBookingGrpcHandlers(f.service));
 await assert.rejects(rpc.call('createBooking',{...input(),vehicleType:''}),{code:3});
 await assert.rejects(rpc.call('createBooking',{...input(),context:{}}),{code:16});
 await assert.rejects(rpc.call('getBooking',{context:customerContext,bookingId:'1'}),{code:5});
 await rpc.call('createBooking',input());f.state.driver.driverId='99';
 await assert.rejects(rpc.call('acceptOffer',{context:driverContext,offerId:'8'}),{code:7});
 f.state.driver.driverId='7';f.state.busyError=AppError.conflict();
 await assert.rejects(rpc.call('acceptOffer',{context:driverContext,offerId:'8'}),{code:9});
 f.state.customerError=new AppError('secret',{statusCode:503});
 await assert.rejects(rpc.call('createBooking',input()),e=>e.code===14&&!e.details.includes('secret'));
});
