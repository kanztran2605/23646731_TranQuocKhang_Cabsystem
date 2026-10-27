'use strict';
const { test,after } = require('node:test');
const assert = require('node:assert/strict');
const { createDriverService } = require('../src/services/driver.service');
const repository = require('../src/repositories/driver.repository');
const { pool,closeDatabase } = require('../src/config/database');
const { decryptLicense } = require('../src/security/license');
const { createTripEventHandler } = require('../src/events/trip-events.consumer');
const created=[]; const events=[]; const phones=[];
const service=createDriverService(repository,async (event)=>events.push(event));
const admin={ actorUserId:'7',actorRole:'ADMIN' };
async function register(index,vehicleType='CAR') {
  const userId=String(Date.now()+index);
  const phone='09'+String(Date.now()+index).slice(-8); phones.push(phone);
  const input={phone,email:'db-'+userId+'@driver.test',otp:'123',name:'DB Test Driver',vehicleType,
    licensePlate:'T'+userId,driverLicense:'LICENSE-INTEGRATION'};
  await service.requestOtp({phone});
  await assert.rejects(service.prepareDriverRegistration({...input,phone:'07'+phone.slice(2)}),{statusCode:400});
  const grant=await service.prepareDriverRegistration(input);
  const profile=await service.registerDriver({ ...input, ...grant,context:{ actorUserId:userId,actorRole:'DRIVER' },userId });
  created.push(profile.driverId);
  return { profile,context:{ actorUserId:userId,actorRole:'DRIVER',actorDriverId:profile.driverId } };
}
after(async()=>{
  try {
    if(created.length) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        // Preserved older owned FKs may use RESTRICT instead of CASCADE.
        for(const table of ['driver_application','vehicle','driver_location','driver_profile','driver']) {
          await client.query('DELETE FROM '+table+' WHERE did=ANY($1::bigint[])',[created]);
        }
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK');throw error; }
      finally { client.release(); }
    }
    if(phones.length) await pool.query('DELETE FROM driver_otp WHERE phone=ANY($1::text[])',[phones]);
  } finally { await closeDatabase(); }
});

test('OTP gắn đúng phone, có hạn, dùng một lần; retry cùng hồ sơ không tạo Driver thứ hai',async()=>{
  const phone='08'+String(Date.now()).slice(-8); phones.push(phone);
  const input={phone,email:'otp-'+Date.now()+'@driver.test',otp:'123',name:'OTP Test',licensePlate:'OT'+Date.now()};
  await assert.rejects(service.prepareDriverRegistration(input),{statusCode:400});
  await service.requestOtp({phone});
  await assert.rejects(service.prepareDriverRegistration({...input,otp:'wrong'}),{statusCode:400});
  assert.equal((await pool.query('SELECT consumed_at FROM driver_otp WHERE phone=$1',[phone])).rows[0].consumed_at,null);
  await pool.query("UPDATE driver_otp SET expires_at=now()-interval '1 second' WHERE phone=$1",[phone]);
  await assert.rejects(service.prepareDriverRegistration(input),{statusCode:400});
  await service.requestOtp({phone});
  const grants=await Promise.all([service.prepareDriverRegistration(input),service.prepareDriverRegistration(input)]);
  assert.equal(grants[0].registrationToken,grants[1].registrationToken);
  await assert.rejects(service.prepareDriverRegistration({...input,name:'Hồ sơ khác'}),{statusCode:400});
  const userId=String(Date.now()), request={...input,...grants[0],userId,context:{actorUserId:userId,actorRole:'DRIVER'}};
  const profile=await service.registerDriver(request); created.push(profile.driverId);
  assert.equal(profile.vehicle.vehicleType,'BIKE');
  assert.equal((await service.registerDriver(request)).driverId,profile.driverId);
  await assert.rejects(service.requestOtp({phone}),{statusCode:409});
  const summary=await service.getAssignedDriver({driverId:profile.driverId,vehicleId:profile.vehicle.vehicleId});
  assert.equal(summary.licensePlate,input.licensePlate); assert.ok(!Object.hasOwn(summary,'phone'));
  const otherPhone='03'+phone.slice(2);phones.push(otherPhone);await service.requestOtp({phone:otherPhone});
  await assert.rejects(service.prepareDriverRegistration({...input,phone:otherPhone,licensePlate:input.licensePlate.toLowerCase()}),{statusCode:409});
});
test('real driver_db: atomic onboarding creates all four records and ciphertext',async()=>{
  const {profile}=await register(0);
  const raw=(await pool.query('SELECT d.ap,d.av,p.lic_enc,p.key_ver,v.vt,a.s FROM driver d JOIN driver_profile p USING(did) JOIN vehicle v USING(did) JOIN driver_application a ON a.did=d.did AND a.vid=v.vid WHERE d.did=$1',[profile.driverId])).rows[0];
  assert.equal(raw.ap,'PENDING_APPROVAL'); assert.equal(raw.av,'OFFLINE'); assert.equal(raw.vt,'CAR'); assert.equal(raw.s,'PENDING_APPROVAL');
  assert.ok(!raw.lic_enc.includes('LICENSE-INTEGRATION')); assert.equal(decryptLicense(raw.lic_enc),'LICENSE-INTEGRATION'); assert.equal(raw.key_ver,1);
  const before=await pool.query('SELECT COUNT(*) FROM driver');
  const invalidUserId=String(Date.now()+99);
  await assert.rejects(service.registerDriver({ context:{actorUserId:invalidUserId,actorRole:'DRIVER'},userId:invalidUserId,otp:'bad',name:'X',vehicleType:'CAR',licensePlate:'X' }),(e)=>e.statusCode===400);
  assert.equal((await pool.query('SELECT COUNT(*) FROM driver')).rows[0].count,before.rows[0].count);
});
test('real driver_db: approval, location isolation, concurrent assignment and stale terminal-event safety',async()=>{
  const {profile,context}=await register(1);
  await assert.rejects(service.setAvailability({context,online:true}),(e)=>e.statusCode===409);
  await assert.rejects(service.markBusyForAssignment({context,driverId:profile.driverId}),(e)=>e.statusCode===409);
  assert.ok((await service.listPendingDrivers({context:admin,page:1,limit:20})).items.some((d)=>d.driverId===profile.driverId));
  await service.reviewDriverApproval({context:admin,driverId:profile.driverId,approvalStatus:'APPROVED'});
  assert.equal(events.at(-1).eventType,'driver.approval.changed');
  assert.equal((await pool.query('SELECT s FROM driver_application WHERE did=$1',[profile.driverId])).rows[0].s,'APPROVED');
  await service.setAvailability({context,online:true});
  await service.updateLocation({context,latitude:10.76,longitude:106.68});
  await service.updateLocation({context,latitude:10.761,longitude:106.681});
  assert.equal((await pool.query('SELECT COUNT(*) FROM driver_location WHERE did=$1',[profile.driverId])).rows[0].count,'1');
  assert.equal((await service.getDriverByUserId({userId:context.actorUserId})).availabilityStatus,'AVAILABLE');
  assert.equal((await service.getDriverLocation({driverId:profile.driverId})).latitude,10.761);
  const attempts=await Promise.allSettled([service.markBusyForAssignment({context,driverId:profile.driverId}),service.markBusyForAssignment({context,driverId:profile.driverId})]);
  assert.equal(attempts.filter((r)=>r.status==='fulfilled').length,1);
  assert.equal(attempts.find((r)=>r.status==='rejected').reason.statusCode,409);
  const handler=createTripEventHandler(service);
  const completedAt=new Date().toISOString();
  await handler({eventType:'trip.completed',payload:{driverId:profile.driverId,completedAt}});
  assert.equal((await repository.findById(profile.driverId)).av,'AVAILABLE');
  await service.markBusyForAssignment({context,driverId:profile.driverId});
  await handler({eventType:'trip.completed',payload:{driverId:profile.driverId,completedAt}});
  assert.equal((await repository.findById(profile.driverId)).av,'BUSY');
  await handler({eventType:'trip.canceled',payload:{driverId:profile.driverId,canceledAt:new Date().toISOString()}});
  assert.equal((await repository.findById(profile.driverId)).av,'AVAILABLE');
  await service.setAvailability({context,online:false});
  assert.equal((await repository.findById(profile.driverId)).av,'OFFLINE');
});
test('real PostGIS: 1 km radius, paging, multiple-status visibility and strict string vehicle matching',async()=>{
  const group=[];
  for(let i=0;i<5;i++){
    const item=await register(i+10,i===4?'BIKE':'CAR'); group.push(item);
    await service.updateLocation({context:item.context,latitude:-45+0.001*i,longitude:45});
    if(i===0 || i===1 || i===4){
      await service.reviewDriverApproval({context:admin,driverId:item.profile.driverId,approvalStatus:'APPROVED'});
      await service.setAvailability({context:item.context,online:true});
      if(i===1) await service.markBusyForAssignment({context:item.context,driverId:item.profile.driverId});
    } else if(i===3) await service.reviewDriverApproval({context:admin,driverId:item.profile.driverId,approvalStatus:'REJECTED'});
  }
  const first=await service.getNearbyDrivers({context:admin,latitude:-45,longitude:45,radiusKm:1,page:1,limit:2});
  const second=await service.getNearbyDrivers({context:admin,latitude:-45,longitude:45,radiusKm:1,page:2,limit:2});
  assert.equal(first.total,'5'); assert.equal(first.items.length,2); assert.equal(second.items.length,2);
  assert.equal(first.items[1].availabilityStatus,'BUSY');
  assert.equal(second.items[0].approvalStatus,'PENDING_APPROVAL'); assert.equal(second.items[1].approvalStatus,'REJECTED');
  const candidates=await service.findEligibleDrivers({pickupLatitude:-45,pickupLongitude:45,radiusKm:1,vehicleType:'CAR',limit:20});
  assert.deepEqual(candidates.items.map((d)=>d.driverId),[group[0].profile.driverId]);
  assert.equal(candidates.items[0].userId,group[0].context.actorUserId);
  const bikes=await service.findEligibleDrivers({pickupLatitude:-45,pickupLongitude:45,radiusKm:1,vehicleType:'BIKE',limit:20});
  assert.deepEqual(bikes.items.map((d)=>d.driverId),[group[4].profile.driverId]);
  assert.equal((await service.getNearbyDrivers({context:admin,latitude:-45,longitude:45,radiusKm:0.05,page:1,limit:20})).items.length,1);
  assert.equal((await service.getNearbyDrivers({context:admin,latitude:-45,longitude:45,radiusKm:1,page:99,limit:20})).total,'5');
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'driver_db');
});
