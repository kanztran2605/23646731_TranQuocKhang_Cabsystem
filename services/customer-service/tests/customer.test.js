'use strict';
const { test,beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createCustomerService } = require('../src/services/customer.service');
const { createCustomerGrpcHandlers } = require('../src/grpc/customer.grpc');
const { serve } = require('../../../shared/tests/grpc-service');
let service,rows;
const owner = { actorUserId:'100',actorRole:'CUSTOMER' };
const admin = { actorUserId:'7',actorRole:'ADMIN' };
beforeEach(() => {
  rows = [{ cid:'1',uid:'100',name:'Customer',addr:'HCMC',c_at:new Date(),u_at:new Date() }];
  service = createCustomerService({
    async createProfile(input) {
      if (rows.some((r) => r.uid === input.userId)) throw Object.assign(new Error(),{ code:'23505' });
      const row = { cid:'2',uid:input.userId,name:input.name,addr:input.address ?? null,c_at:new Date(),u_at:new Date() };
      rows.push(row); return row;
    },
    async findById(id) { return rows.find((r) => r.cid === id); },
    async findByUserId(id) { return rows.find((r) => r.uid === id); },
  });
});
test('create/get profile uses canonical fields and logical uid without Auth credentials',async () => {
  const created = await service.createCustomerProfile({ userId:'200',name:' New ',address:'Address' });
  assert.equal(created.userId,'200'); assert.equal(created.name,'New');
  assert.deepEqual(Object.keys(created).sort(),['address','createdAt','customerId','name','updatedAt','userId']);
  assert.equal((await service.getCustomer({ context:admin,customerId:'2' })).address,'Address');
});
test('owner and Admin may get Customer while other actors are forbidden',async () => {
  assert.equal((await service.getCustomer({ context:owner,customerId:'1' })).name,'Customer');
  for (const context of [{ actorUserId:'200',actorRole:'CUSTOMER' },{ actorUserId:'2',actorRole:'DRIVER' }]) {
    await assert.rejects(service.getCustomer({ context,customerId:'1' }),(e) => e.statusCode === 403);
  }
  await assert.rejects(service.getCustomer({ customerId:'1' }),(e) => e.statusCode === 401);
});
test('Customer validates required fields and canonical int64 identifiers',async () => {
  for (const request of [{ userId:'0',name:'X' },{ userId:'3',name:'' },{ userId:'9223372036854775808',name:'X' },{ userId:'3',name:'X',address:'x'.repeat(256) }]) {
    await assert.rejects(service.createCustomerProfile(request),(e) => e.statusCode === 400);
  }
});
test('duplicate logical uid is a conflict',async () => {
  await assert.rejects(service.createCustomerProfile({ userId:'100',name:'X' }),(e) => e.statusCode === 409);
});
test('get not found is deterministic',async () => {
  await assert.rejects(service.getCustomer({ context:admin,customerId:'99' }),(e) => e.statusCode === 404);
  await assert.rejects(service.getCustomerByUserId({ userId:'99' }),(e) => e.statusCode === 404);
});
test('Booking-facing get and validation work without reverse dependency',async () => {
  assert.equal((await service.getCustomerByUserId({ userId:'100' })).customerId,'1');
  assert.deepEqual(await service.validateCustomer({ customerId:'1' }),{ valid:true,customerId:'1',userId:'100' });
  assert.deepEqual(await service.validateCustomer({ customerId:'99' }),{ valid:false,customerId:'99' });
});
test('only the four current Customer proto operations are exposed',() => {
  assert.deepEqual(Object.keys(createCustomerGrpcHandlers(service)).sort(),['createCustomerProfile','getCustomer','getCustomerByUserId','validateCustomer']);
});
test('real Customer gRPC supports Booking validation/get and HealthService',async (t) => {
  const rpc = await serve(t,'customer.proto','cab.customer.v1','CustomerService',createCustomerGrpcHandlers(service));
  assert.equal((await rpc.call('validateCustomer',{ customerId:'1' })).valid,true);
  assert.equal((await rpc.call('getCustomerByUserId',{ userId:'100' })).name,'Customer');
  assert.equal((await rpc.call('getCustomer',{ context:owner,customerId:'1' })).customerId,'1');
  assert.equal((await rpc.call('createCustomerProfile',{ userId:'200',name:'RPC' })).name,'RPC');
  await assert.rejects(rpc.call('getCustomer',{ context:admin,customerId:'99' }),(e) => e.code === 5);
  assert.equal((await rpc.checkHealth()).status,'UP');
});
