'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('../../../shared/tests/grpc-service');
test('Booking Driver client uses current lookup/assignment RPCs and maps state conflicts',async (t) => {
  let request,candidateRequest,fail = false;
  const rpc = await serve(t,'driver.proto','cab.driver.v1','DriverService',{
    getDriverByUserId(call,callback) { callback(null,{ driverId:'5',userId:call.request.userId,approvalStatus:'APPROVED',availabilityStatus:'AVAILABLE' }); },
    findEligibleDrivers(call,callback) {
      candidateRequest=call.request;
      assert.deepEqual(call.metadata.get('x-correlation-id'),['assignment-test']);
      callback(null,{items:[{driverId:'5',vehicleId:'8',vehicleType:'CAR',latitude:10.76,longitude:106.68,distanceKm:0.1}]});
    },
    markBusyForAssignment(call,callback) {
      request=call.request;
      if (fail) callback({ code:9,details:'Driver state conflict' });
      else callback(null,{ driverId:request.driverId,userId:request.context.actorUserId,approvalStatus:'APPROVED',availabilityStatus:'BUSY' });
    },
  });
  // This test uses the same live server through the production Booking client.
  process.env.DRIVER_GRPC_HOST='127.0.0.1';
  // The server helper returns its bound address for production client tests.
  process.env.DRIVER_GRPC_PORT=String(rpc.port);
  const client=require('../src/grpc/driver.client');
  t.after(()=>client.closeDriverClient());
  const context={ actorUserId:'6',actorRole:'DRIVER',correlationId:'assignment-test' };
  assert.equal((await client.getMyDriverProfile(context)).driverId,'5');
  const candidates=await client.findEligibleDrivers({pickupLatitude:10.76,pickupLongitude:106.68,radiusKm:1,
    vehicleType:'CAR',limit:20,correlationId:'assignment-test'});
  assert.equal(candidates.items[0].vehicleType,'CAR');
  assert.deepEqual(candidateRequest,{pickupLatitude:10.76,pickupLongitude:106.68,radiusKm:1,
    vehicleType:'CAR',limit:20,correlationId:'assignment-test'});
  assert.equal((await client.markBusyForAssignment(context,'5')).availabilityStatus,'BUSY');
  assert.equal(request.driverId,'5'); assert.deepEqual(request.context,context);
  fail=true;
  await assert.rejects(client.markBusyForAssignment(context,'5'),(e)=>e.statusCode===409);
});
