'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEventEnvelope}=require('../rabbitmq/publisher');
const payload={bookingId:'1',customerId:'3',customerUserId:'13',driverId:'8',driverUserId:'14',vehicleId:'9',offerId:'1',tripId:'1',paymentId:'1',userId:'14',
 recipientUserIds:['13'],createdAt:'2026-10-04T10:00:00Z',acceptedAt:'2026-10-04T10:00:00Z',approvalStatus:'APPROVED',changedAt:'2026-10-04T10:00:00Z',
 fromStatus:'ASSIGNED',toStatus:'ARRIVED',reason:'x',canceledAt:'2026-10-04T10:00:00Z',completedAt:'2026-10-04T10:00:00Z',amount:50000,paidAt:'2026-10-04T10:00:00Z'};
test('five Notification events require a non-empty array of string User IDs',()=>{
 for(const eventType of ['offer.created','driver.approval.changed','trip.status.changed','trip.canceled','payment.completed']){
  assert.doesNotThrow(()=>createEventEnvelope({eventType,payload}));
  for(const recipientUserIds of [undefined,[],['0'],[13]])assert.throws(()=>createEventEnvelope({eventType,payload:{...payload,recipientUserIds}}));
 }
});
test('upstream events propagate explicit logical User references with canonical scalar type',()=>{
 for(const eventType of ['booking.created','driver.accepted','trip.completed']){
  assert.doesNotThrow(()=>createEventEnvelope({eventType,payload}));
  for(const customerUserId of [undefined,13,'0'])assert.throws(()=>createEventEnvelope({eventType,payload:{...payload,customerUserId}}));
 }
 for(const eventType of ['driver.accepted','trip.completed'])assert.throws(()=>createEventEnvelope({eventType,payload:{...payload,driverUserId:undefined}}));
});
