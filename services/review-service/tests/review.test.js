'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createReviewService}=require('../src/services/review.service');
const {serve}=require('../../../shared/tests/grpc-service');
const {createReviewGrpcHandlers}=require('../src/grpc/review.grpc');
const {AppError}=require('../../../shared/errors/app-error');
function fixture(){
 const state={rows:[],calls:[],trip:{tripId:'1',bookingId:'20',customerId:'3',driverId:'8',customerUserId:'13',driverUserId:'14',completed:true,status:'COMPLETED'}};
 const trip={async validateCompletedTrip(tripId,correlationId){state.calls.push({tripId,correlationId});if(state.error)throw state.error;return {...state.trip};}};
 const repo={async create(input){if(state.rows.length)throw Object.assign(new Error('unique'),{code:'23505'});const row={rid:'1',tid:input.tripId,cid:input.customerId,did:input.driverId,star:input.score,cmt:input.comment,c_at:new Date().toISOString()};state.rows.push(row);return row;}};
 const service=createReviewService({repo,trip});const request=()=>({context:{actorUserId:'13',actorRole:'CUSTOMER',correlationId:'review-test'},tripId:'1',score:5,comment:'ok'});return {state,service,request};
}
test('own COMPLETED Trip review persists canonical score/comment and derives Driver from Trip gRPC',async()=>{
 const f=fixture();const r=await f.service.createReview({...f.request(),driverId:'999'});assert.equal(r.score,5);assert.equal(r.comment,'ok');assert.equal(r.driverId,'8');assert.equal(r.customerId,'3');
 assert.deepEqual(f.state.calls,[{tripId:'1',correlationId:'review-test'}]);assert.equal(f.state.rows.length,1);
});
test('incomplete/canceled Trips rejected',async()=>{
 for(const status of ['ASSIGNED','IN_PROGRESS','CANCELED']){const f=fixture();f.state.trip.status=status;f.state.trip.completed=false;await assert.rejects(f.service.createReview(f.request()),{statusCode:409});assert.equal(f.state.rows.length,0);}
});
test('wrong Customer UID rejected even if numeric ID equals cid',async()=>{
 const f=fixture();await assert.rejects(f.service.createReview({...f.request(),context:{actorUserId:'3',actorRole:'CUSTOMER'}}),{statusCode:403});assert.equal(f.state.rows.length,0);
});
test('inconsistent Customer context and Trip validation ID rejected',async()=>{
 const f=fixture();await assert.rejects(f.service.createReview({...f.request(),context:{...f.request().context,actorCustomerId:'99'}}),{statusCode:403});
 f.state.trip.tripId='99';await assert.rejects(f.service.createReview(f.request()),{statusCode:403});
});
test('duplicate same Trip review rejected deterministically',async()=>{
 const f=fixture();await f.service.createReview(f.request());await assert.rejects(f.service.createReview(f.request()),{statusCode:409,code:'ALREADY_EXISTS'});assert.equal(f.state.rows.length,1);
});
test('scores 1 and 5 accepted; invalid scores rejected before gRPC',async()=>{
 for(const score of [1,5]){const f=fixture();assert.equal((await f.service.createReview({...f.request(),score})).score,score);}
 for(const score of [0,6,-1,1.5,NaN]){const f=fixture();await assert.rejects(f.service.createReview({...f.request(),score}),{statusCode:400});assert.equal(f.state.calls.length,0);}
});
test('XSS/script and event-handler markup removed; plain text stays safe',async()=>{
 const f=fixture();const r=await f.service.createReview({...f.request(),comment:'<script>alert(1)</script><img src=x onerror=alert(2)>ok'});assert.equal(r.comment,'ok');assert.ok(!JSON.stringify(r).includes('<script>'));
});
test('optional/empty comment allowed; oversized or non-text comment rejected',async()=>{
 const f=fixture();const req=f.request();delete req.comment;assert.equal((await f.service.createReview(req)).comment,undefined);
 const empty=fixture();assert.equal((await empty.service.createReview({...empty.request(),comment:''})).comment,'');
 for(const comment of ['x'.repeat(256),123]){const other=fixture();await assert.rejects(other.service.createReview({...other.request(),comment}),{statusCode:400});}
});
test('Driver/Admin cannot create Review; missing authentication rejected',async()=>{
 const f=fixture();for(const actorRole of ['DRIVER','ADMIN'])await assert.rejects(f.service.createReview({...f.request(),context:{actorUserId:'13',actorRole}}),{statusCode:403});
 await assert.rejects(f.service.createReview({...f.request(),context:{}}),{statusCode:401});
});
test('Trip not found/downstream failure preserved without persistence',async()=>{
 const f=fixture();f.state.error=AppError.notFound();await assert.rejects(f.service.createReview(f.request()),{statusCode:404});assert.equal(f.state.rows.length,0);
});
test('real Review proto gRPC sanitizes comment, rejects duplicates and implements HealthService',async t=>{
 const f=fixture(),api=await serve(t,'review.proto','cab.review.v1','ReviewService',createReviewGrpcHandlers(f.service));assert.equal((await api.call('createReview',f.request())).driverId,'8');
 await assert.rejects(api.call('createReview',f.request()),{code:6});assert.equal((await api.checkHealth()).status,'UP');
});
