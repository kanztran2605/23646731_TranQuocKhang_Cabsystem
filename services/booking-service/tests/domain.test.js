'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {BOOKING_STATUS,toBooking,isTerminalBookingStatus}=require('../src/domain/booking');
const {toDriverOffer}=require('../src/domain/driver-offer');const {toDriverAssignment}=require('../src/domain/driver-assignment');
test('Booking domain matches current proto fields and statuses',()=>{
 const b=toBooking({bid:8,cid:2,p_lat:'10.76',p_lng:'106.68',d_lat:10.77,d_lng:106.7,vt:'CAR',s:'ASSIGNED',c_at:new Date(),ass_at:new Date(),oid:6,did:7});
 assert.equal(b.bookingId,'8');assert.equal(b.vehicleType,'CAR');assert.equal(b.driverId,'7');assert.equal(b.offerId,'6');assert.equal(b.pickup.latitude,10.76);
 assert.deepEqual(Object.keys(BOOKING_STATUS).sort(),['ASSIGNED','NO_DRIVER_FOUND','SEARCHING']);
 assert.ok(isTerminalBookingStatus('ASSIGNED'));assert.ok(isTerminalBookingStatus('NO_DRIVER_FOUND'));assert.equal(isTerminalBookingStatus('SEARCHING'),false);
});
test('Offer maps only canonical fields including accepted timestamp',()=>{
 const o=toDriverOffer({oid:6,bid:8,did:7,vid:7,s:'ACCEPTED',c_at:new Date(),acc_at:new Date()});
 assert.equal(o.offerId,'6');assert.equal(o.vehicleId,'7');assert.ok(o.acceptedAt);assert.equal(Object.hasOwn(o,'expiresAt'),false);
});
test('Assignment uses canonical schema identifiers and timestamp',()=>{
 const a=toDriverAssignment({aid:3,bid:8,oid:6,did:7,vid:7,ass_at:new Date('2026-10-04T10:00:00Z')});
 assert.deepEqual(a,{assignmentId:'3',bookingId:'8',offerId:'6',driverId:'7',vehicleId:'7',assignedAt:'2026-10-04T10:00:00.000Z'});
});
