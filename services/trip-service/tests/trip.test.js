'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,customer,driver,assignment}=require('./fixture');
const {createTripPublisher}=require('../src/events/trip.publisher');
const {validateEventEnvelope}=require('../../../shared/rabbitmq/publisher');
const {serve}=require('../../../shared/tests/grpc-service');
const {createTripGrpcHandlers}=require('../src/grpc/trip.grpc');
test('assignment persists one ASSIGNED unpaid Trip, logical UID references and initial history before publish',async()=>{
 const f=fixture(),result=await f.service.assigned(assignment(),'corr');
 assert.equal(result.status,'ASSIGNED');assert.equal(result.paid,false);assert.equal(f.state.rows[0].customer_uid,'13');
 assert.deepEqual(f.state.operations,['trip.persist','history.persist','commit','trip.status.changed']);assert.equal(f.state.history[0].from_s,null);
});
test('duplicate assignment creates no second Trip/history/event; conflicting delivery rejected',async()=>{
 const f=fixture();await f.service.assigned(assignment());await f.service.assigned(assignment());
 assert.equal(f.state.rows.length,1);assert.equal(f.state.history.length,1);assert.equal(f.state.events.length,1);
 await assert.rejects(f.service.assigned({...assignment(),driverId:'9'}),{statusCode:409});
});
test('get by Trip and Booking ID; deterministic not found',async()=>{
 const f=fixture();await f.service.assigned(assignment());assert.equal((await f.service.getTrip(f.request())).tripId,'1');
 assert.equal((await f.service.getTripByBooking({context:customer,bookingId:'20'})).tripId,'1');
 await assert.rejects(f.service.getTrip({...f.request(),tripId:'99'}),{statusCode:404});
});
test('ownership uses uid, never cid/did as user identity; role and context mismatch rejected',async()=>{
 const f=fixture();await f.service.assigned(assignment());
 for(const context of [{...customer,actorUserId:'3'},{...driver,actorUserId:'8'},{...customer,actorCustomerId:'99'}]) await assert.rejects(f.service.getTrip(f.request(context)),{statusCode:403});
 await assert.rejects(f.service.getTrip(f.request({})),{statusCode:401});
});
for(const [from,to] of [['ASSIGNED','ARRIVED'],['ARRIVED','IN_PROGRESS'],['IN_PROGRESS','COMPLETED']]) test(from+' -> '+to+' persists history before events',async()=>{
 const f=fixture();await f.service.assigned(assignment());f.state.rows[0].s=from;f.state.events=[];f.state.operations=[];
 const result=await f.service.updateTripStatus({...f.request(driver),status:to});
 assert.equal(result.status,to);assert.equal(result.paid,false);assert.equal(f.state.history.at(-1).from_s,from);
 assert.deepEqual(f.state.operations.slice(0,3),['trip.persist','history.persist','commit']);
 assert.deepEqual(f.state.events.map(e=>e.type),to==='COMPLETED'?['trip.status.changed','trip.completed']:['trip.status.changed']);
});
test('out-of-sequence transition rejected without new history/events',async()=>{
 const f=fixture();await f.service.assigned(assignment());await assert.rejects(f.service.updateTripStatus({...f.request(driver),status:'COMPLETED'}),{statusCode:400});
 assert.equal(f.state.history.length,1);assert.equal(f.state.events.length,1);
});
for(const status of ['COMPLETED','CANCELED']) test(status+' terminal status rejects further transition/cancellation',async()=>{
 const f=fixture();await f.service.assigned(assignment());f.state.rows[0].s=status;
 await assert.rejects(f.service.updateTripStatus({...f.request(driver),status:'ARRIVED'}),{statusCode:409});
 await assert.rejects(f.service.cancelTrip({...f.request(),reason:'x'}),{statusCode:409});assert.equal(f.state.history.length,1);
});
test('Customer cannot change Trip status; another Driver cannot update assigned Trip',async()=>{
 const f=fixture();await f.service.assigned(assignment());
 await assert.rejects(f.service.updateTripStatus({...f.request(),status:'ARRIVED'}),{statusCode:403});
 await assert.rejects(f.service.updateTripStatus({...f.request({...driver,actorUserId:'99'}),status:'ARRIVED'}),{statusCode:403});
});
for(const state of ['ASSIGNED','ARRIVED','IN_PROGRESS']) test('cancel '+state+' persists reason/history and only cancellation event',async()=>{
 const f=fixture();await f.service.assigned(assignment());f.state.rows[0].s=state;f.state.events=[];
 const result=await f.service.cancelTrip({...f.request(),reason:'x'});assert.equal(result.status,'CANCELED');assert.equal(result.cancelReason,'x');
 assert.equal(f.state.history.at(-1).to_s,'CANCELED');assert.deepEqual(f.state.events.map(e=>e.type),['trip.canceled']);
});
test('cancel requires reason and owning Customer',async()=>{
 const f=fixture();await f.service.assigned(assignment());await assert.rejects(f.service.cancelTrip({...f.request(),reason:''}),{statusCode:400});
 await assert.rejects(f.service.cancelTrip({...f.request({...customer,actorUserId:'99'}),reason:'x'}),{statusCode:403});
});
test('location update in progress validates Driver over gRPC without changing status/paid/profile',async()=>{
 const f=fixture();await f.advance();const result=await f.service.updateTripLocation({...f.request(driver),latitude:0,longitude:180});
 assert.equal(result.longitude,180);assert.equal(f.state.rows[0].s,'IN_PROGRESS');assert.equal(f.state.rows[0].paid,false);
 assert.deepEqual(f.state.driverCalls,[{did:'8',correlationId:'trip-test'}]);assert.equal(f.state.history.length,3);
});
test('location update before/after in-progress rejected without persistence',async()=>{
 const f=fixture();await f.service.assigned(assignment());
 for(const s of ['ASSIGNED','ARRIVED','COMPLETED','CANCELED']){f.state.rows[0].s=s;await assert.rejects(f.service.updateTripLocation({...f.request(driver),latitude:0,longitude:0}),{statusCode:409});}
 assert.equal(f.state.locations.length,0);
});
test('invalid coordinates rejected',async()=>{
 const f=fixture();await f.advance();for(const [latitude,longitude] of [[91,0],[-91,0],[0,181],[0,-181],[NaN,0]])await assert.rejects(f.service.updateTripLocation({...f.request(driver),latitude,longitude}),{statusCode:400});
 assert.equal(f.state.locations.length,0);
});
test('completion keeps paid false; correct repeated Payment event sets paid without status/history change',async()=>{
 const f=fixture();await f.advance();await f.service.updateTripStatus({...f.request(driver),status:'COMPLETED'});
 assert.equal(f.state.rows[0].paid,false);const payload={tripId:'1',bookingId:'20',customerId:'3',recipientUserIds:['13']};
 await f.service.paymentCompleted(payload);await f.service.paymentCompleted(payload);
 assert.equal(f.state.rows[0].paid,true);assert.equal(f.state.rows[0].s,'COMPLETED');assert.equal(f.state.history.length,4);
});
test('Payment event mismatched Booking/Customer/recipient or unfinished Trip rejected',async()=>{
 const f=fixture();await f.advance();const p={tripId:'1',bookingId:'20',customerId:'3',recipientUserIds:['13']};
 await assert.rejects(f.service.paymentCompleted(p),{statusCode:409});f.state.rows[0].s='COMPLETED';
 for(const wrong of [{bookingId:'99'},{customerId:'99'},{recipientUserIds:['3']}])await assert.rejects(f.service.paymentCompleted({...p,...wrong}),{statusCode:409});
 assert.equal(f.state.rows[0].paid,false);
});
test('Trip publisher canonical payloads carry correct recipients/User refs and deterministic event IDs',async()=>{
 const f=fixture();await f.advance();const row=f.state.rows[0];row.s='COMPLETED';row.done_at=row.u_at;row.can_at=row.u_at;row.r='x';const events=[];
 const publish=createTripPublisher(async e=>events.push(e));
 for(const type of ['trip.status.changed','trip.completed','trip.canceled'])await publish(type,row,'IN_PROGRESS','corr');
 for(const e of events)validateEventEnvelope(e,e.eventType);
 assert.deepEqual(events[0].payload.recipientUserIds,['13']);assert.deepEqual(events[2].payload.recipientUserIds,['13','14']);
 assert.equal(events[1].payload.bookingId,'20');assert.equal(events[1].payload.customerUserId,'13');assert.equal(events[1].payload.driverUserId,'14');
});
test('real Trip proto gRPC operations, Review validation and HealthService',async t=>{
 const f=fixture();await f.service.assigned(assignment());const api=await serve(t,'trip.proto','cab.trip.v1','TripService',createTripGrpcHandlers(f.service));
 assert.equal((await api.call('getTrip',f.request())).status,'ASSIGNED');
 const validation=await api.call('validateCompletedTrip',{tripId:'1'});assert.equal(validation.customerUserId,'13');assert.equal(validation.completed,false);
 assert.equal((await api.call('getTripStatusHistory',f.request())).items.length,1);assert.equal((await api.checkHealth()).status,'UP');
});
