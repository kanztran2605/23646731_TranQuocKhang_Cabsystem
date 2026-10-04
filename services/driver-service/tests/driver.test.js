'use strict';
process.env.OTP_MOCK_CODE = '123';
const { test,beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Public seed fixture key from the development example; never read real .env.
process.env.DATA_ENCRYPTION_KEY_BASE64 = fs.readFileSync(path.resolve(__dirname,'../../../.env.example'),'utf8')
  .match(/^DATA_ENCRYPTION_KEY_BASE64=(.+)$/m)[1].trim();
const { createDriverService } = require('../src/services/driver.service');
const { createDriverGrpcHandlers } = require('../src/grpc/driver.grpc');
const { createTripEventHandler } = require('../src/events/trip-events.consumer');
const { encryptLicense,decryptLicense } = require('../src/security/license');
const { serve } = require('../../../shared/tests/grpc-service');
let service, row, published, captured, candidateQuery;
const owner = { actorUserId:'2',actorRole:'DRIVER',actorDriverId:'1' };
const admin = { actorUserId:'7',actorRole:'ADMIN' };
const onboarding = { context:owner,userId:'2',otp:'123',name:'Driver',vehicleType:'CAR',licensePlate:'51A1',driverLicense:'LICENSE-UNIT' };
beforeEach(() => {
  row = { did:'1',uid:'2',ap:'APPROVED',av:'AVAILABLE',name:'Driver',vid:'1',vt:'CAR',plate:'51A1',vehicle_status:'ACTIVE',
    lat:10.76,lng:106.68,rec_at:new Date(),distance_km:0 };
  published = []; captured = null;
  service = createDriverService({
    async findById(id) { return id === '1' ? row : undefined; },
    async findByUserId(id) { return id === '2' ? row : undefined; },
    async register(input) { captured=input; row={ ...row,ap:'PENDING_APPROVAL',av:'OFFLINE' }; return row; },
    async pending() { return { total:1,rows:[row] }; },
    async approve(input) {
      if (row.ap !== 'PENDING_APPROVAL') return null;
      row.ap=input.approvalStatus; return { driver:row,changedAt:new Date() };
    },
    async availability(input) {
      if (row.av === 'BUSY' || (input.online && row.ap !== 'APPROVED')) return null;
      row.av=input.online ? 'AVAILABLE' : 'OFFLINE'; return row;
    },
    async markBusy() { if (row.ap !== 'APPROVED' || row.av !== 'AVAILABLE') return null; row.av='BUSY'; return row; },
    async updateLocation(input) { row.lat=input.latitude; row.lng=input.longitude; return row; },
    async location() { return row; },
    async nearby(input) { candidateQuery=input; return { total:1,rows:[row] }; },
    async eligible(input) { candidateQuery=input; return [row]; },
    async releaseAfterTrip() { if (row.ap === 'APPROVED' && row.av === 'BUSY') row.av='AVAILABLE'; },
  }, async (event) => { published.push(event); });
});
test('Driver OTP is deterministic from ENV',async () => { assert.deepEqual(await service.requestOtp({ email:'newd@d.com' }),{ otp:'123' }); });
test('wrong OTP cannot persist onboarding',async () => {
  await assert.rejects(service.registerDriver({ ...onboarding,otp:'wrong' }),(e) => e.statusCode === 400);
  assert.equal(captured,null);
});
test('onboarding starts pending/offline and stores authenticated ciphertext only',async () => {
  const result = await service.registerDriver(onboarding);
  assert.equal(result.approvalStatus,'PENDING_APPROVAL'); assert.equal(result.availabilityStatus,'OFFLINE');
  assert.ok(!captured.encryptedLicense.includes(onboarding.driverLicense));
  assert.equal(decryptLicense(captured.encryptedLicense),onboarding.driverLicense);
  assert.equal(captured.driverLicense,undefined); assert.ok(!JSON.stringify(result).includes('LICENSE'));
  assert.equal(captured.vehicleType,'CAR');
});
test('license encryption has random nonces and rejects tampering/wrong keys',() => {
  const first=encryptLicense('TEST-LICENSE'); assert.notEqual(first,encryptLicense('TEST-LICENSE'));
  const parts=first.split(':'); const ciphertext=Buffer.from(parts[2],'base64'); ciphertext[0]^=1; parts[2]=ciphertext.toString('base64');
  assert.throws(() => decryptLicense(parts.join(':')));
  const original=process.env.DATA_ENCRYPTION_KEY_BASE64;
  try { process.env.DATA_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,1).toString('base64'); assert.throws(() => decryptLicense(first)); }
  finally { process.env.DATA_ENCRYPTION_KEY_BASE64=original; }
});

test('UTF-8 license ciphertext fits the canonical storage column',async () => {
  await service.registerDriver({ ...onboarding,driverLicense:'a'.repeat(100) });
  assert.ok(captured.encryptedLicense.length <= 255);
  captured = null;
  await assert.rejects(service.registerDriver({ ...onboarding,driverLicense:'界'.repeat(100) }),(e) => e.statusCode === 400);
  assert.equal(captured,null);
});
test('five encrypted seed licenses decrypt with the example development key',() => {
  const seed=fs.readFileSync(path.resolve(__dirname,'../../../infrastructure/postgres/seed.sql'),'utf8');
  const matches=[...seed.matchAll(/'((?:v1:)[^']+)'/g)];
  assert.equal(matches.length,5);
  for (let i=0;i<5;i++) assert.equal(decryptLicense(matches[i][1]),'DL-DEMO-'+String(i+1).padStart(3,'0'));
  assert.ok(!seed.includes('enc:v1:DL-DEMO-'));
});
test('pending list and detail enforce Admin business context',async () => {
  row.ap='PENDING_APPROVAL';
  assert.equal((await service.listPendingDrivers({ context:admin,page:1,limit:5 })).items[0].approvalStatus,'PENDING_APPROVAL');
  assert.equal((await service.getDriver({ context:admin,driverId:'1' })).driverId,'1');
  await assert.rejects(service.getDriver({ context:{ actorUserId:'1',actorRole:'CUSTOMER' },driverId:'1' }),(e) => e.statusCode === 403);
});
for (const approvalStatus of ['APPROVED','REJECTED']) {
  test('Admin '+approvalStatus+' persists before canonical approval event',async () => {
    row.ap='PENDING_APPROVAL';
    assert.equal((await service.reviewDriverApproval({ context:admin,driverId:'1',approvalStatus })).approvalStatus,approvalStatus);
    assert.equal(published.length,1);
    assert.deepEqual(Object.keys(published[0].payload).sort(),['approvalStatus','changedAt','driverId','recipientUserIds','userId']);
    assert.equal(published[0].eventType,'driver.approval.changed');
    assert.equal(published[0].producer,'driver-service');
    await assert.rejects(service.reviewDriverApproval({ context:admin,driverId:'1',approvalStatus }),(e) => e.statusCode === 409);
    assert.equal(published.length,1);
  });
}
test('non-Admin approval and invalid transitions are rejected',async () => {
  await assert.rejects(service.reviewDriverApproval({ context:owner,driverId:'1',approvalStatus:'APPROVED' }),(e) => e.statusCode === 403);
  await assert.rejects(service.reviewDriverApproval({ context:admin,driverId:'1',approvalStatus:'PENDING_APPROVAL' }),(e) => e.statusCode === 400);
});
for (const ap of ['PENDING_APPROVAL','REJECTED']) {
  test(ap+' cannot become AVAILABLE or BUSY',async () => {
    row.ap=ap; row.av='OFFLINE';
    await assert.rejects(service.setAvailability({ context:owner,online:true }),(e) => e.statusCode === 409);
    await assert.rejects(service.markBusyForAssignment({ context:owner,driverId:'1' }),(e) => e.statusCode === 409);
    assert.equal(row.av,'OFFLINE');
  });
}
test('approved Driver can switch OFFLINE/AVAILABLE, but public input cannot set BUSY',async () => {
  row.av='OFFLINE';
  assert.equal((await service.setAvailability({ context:owner,online:true })).availabilityStatus,'AVAILABLE');
  assert.equal((await service.setAvailability({ context:owner,online:false })).availabilityStatus,'OFFLINE');
  await assert.rejects(service.setAvailability({ context:owner,online:'BUSY' }),(e) => e.statusCode === 400);
});
test('MarkBusyForAssignment reserves APPROVED + AVAILABLE and rejects a second assignment',async () => {
  assert.equal((await service.markBusyForAssignment({ context:owner,driverId:'1' })).availabilityStatus,'BUSY');
  await assert.rejects(service.markBusyForAssignment({ context:owner,driverId:'1' }),(e) => e.statusCode === 409);
  await assert.rejects(service.setAvailability({ context:owner,online:false }),(e) => e.statusCode === 409);
});
test('MarkBusyForAssignment rejects missing, offline and foreign Drivers',async () => {
  await assert.rejects(service.markBusyForAssignment({ context:owner,driverId:'99' }),(e) => e.statusCode === 404);
  row.av='OFFLINE';
  await assert.rejects(service.markBusyForAssignment({ context:owner,driverId:'1' }),(e) => e.statusCode === 409);
  await assert.rejects(service.markBusyForAssignment({ context:{ actorUserId:'99',actorRole:'DRIVER' },driverId:'1' }),(e) => e.statusCode === 403);
});
test('current location update is independent of approval, availability and profile',async () => {
  row.ap='PENDING_APPROVAL'; row.av='OFFLINE';
  const original={ ap:row.ap,av:row.av,name:row.name };
  await service.updateLocation({ context:owner,latitude:90,longitude:-180 });
  assert.deepEqual({ ap:row.ap,av:row.av,name:row.name },original);
  assert.equal((await service.getDriverLocation({ driverId:'1' })).latitude,90);
});
test('invalid coordinates are rejected before persistence',async () => {
  for (const [latitude,longitude] of [[91,0],[0,-181],[NaN,0],[0,Infinity]]) {
    await assert.rejects(service.updateLocation({ context:owner,latitude,longitude }),(e) => e.statusCode === 400);
  }
});
test('Nearby preserves multiple-status visibility and passes radius/paging to repository',async () => {
  row.ap='REJECTED'; row.av='OFFLINE';
  const result=await service.getNearbyDrivers({ context:admin,latitude:10.76,longitude:106.68,radiusKm:1,page:2,limit:3 });
  assert.equal(result.items[0].approvalStatus,'REJECTED'); assert.equal(candidateQuery.offset,3); assert.equal(candidateQuery.radiusKm,1);
});
test('matching candidate RPC passes string type and radius, and returns descriptive fields',async () => {
  const result=await service.findEligibleDrivers({ pickupLatitude:10.76,pickupLongitude:106.68,radiusKm:1,vehicleType:'CAR',limit:20 });
  assert.equal(candidateQuery.vehicleType,'CAR'); assert.equal(result.items[0].vehicleType,'CAR');
  await assert.rejects(service.findEligibleDrivers({ pickupLatitude:0,pickupLongitude:0,vehicleType:'1' }),(e) => e.statusCode === 400);
});
for (const eventType of ['trip.completed','trip.canceled']) {
  test(eventType+' releases BUSY Driver idempotently without adding events',async () => {
    row.av='BUSY';
    const handler=createTripEventHandler(service);
    const event={ eventType,payload:{ driverId:'1',completedAt:new Date().toISOString(),canceledAt:new Date().toISOString() } };
    await handler(event); await handler(event); assert.equal(row.av,'AVAILABLE'); assert.equal(published.length,0);
  });
}
test('Driver consumer rejects uncontracted events and invalid terminal timestamps',async () => {
  await assert.rejects(createTripEventHandler(service)({ eventType:'unsupported',payload:{} }));
  await assert.rejects(service.releaseAfterTrip('1','invalid'),(e) => e.statusCode === 400);
});
test('real Driver gRPC supports Booking assignment/eligibility, Trip location, current handlers and health',async (t) => {
  const rpc=await serve(t,'driver.proto','cab.driver.v1','DriverService',createDriverGrpcHandlers(service));
  assert.equal((await rpc.call('requestOtp',{ email:'newd@d.com' })).otp,'123');
  assert.equal((await rpc.call('findEligibleDrivers',{ pickupLatitude:10.76,pickupLongitude:106.68,vehicleType:'CAR',radiusKm:1,limit:20 })).items[0].vehicleType,'CAR');
  assert.equal((await rpc.call('getDriverByUserId',{ userId:'2' })).driverId,'1');
  assert.equal((await rpc.call('getDriverLocation',{ driverId:'1' })).latitude,10.76);
  assert.equal((await rpc.call('markBusyForAssignment',{ context:owner,driverId:'1' })).availabilityStatus,'BUSY');
  await assert.rejects(rpc.call('markBusyForAssignment',{ context:owner,driverId:'1' }),(e) => e.code === 9);
  await assert.rejects(rpc.call('markBusyForAssignment',{ context:owner,driverId:'99' }),(e) => e.code === 5);
  assert.equal((await rpc.checkHealth()).status,'UP');
});
