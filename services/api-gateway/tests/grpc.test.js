'use strict';

process.env.JWT_SECRET = 'gateway-test-secret';
process.env.REDIS_PASSWORD = 'gateway-test-redis';
process.env.LOG_LEVEL = 'error';
process.env.GRPC_HEALTH_TIMEOUT_MS = '150';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { grpc, createServer, getServiceDefinition } = require('../../../shared/grpc/loader');

test('real gRPC clients propagate correlation metadata and bound health timeouts', async (t) => {
  const server = createServer();
  let health = 'UP';
  let hang = false;
  let receivedId;
  server.addService(getServiceDefinition('common/common.proto', 'cab.common.v1', 'HealthService'), {
    check(call, callback) {
      receivedId = call.metadata.get('x-correlation-id')[0];
      if (!hang) callback(null, { status: health });
    },
  });
  server.addService(getServiceDefinition('auth.proto', 'cab.auth.v1', 'AuthService'), {
    login(call, callback) {
      receivedId = call.metadata.get('x-correlation-id')[0];
      assert.equal(call.request.email, 'c@c.com');
      assert.equal(call.request.password, '123');
      callback(null, { userId: '1', role: 'CUSTOMER', accessToken: 'test-token', expiresInSeconds: '3600' });
    },
  });
  const port = await new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, boundPort) => error ? reject(error) : resolve(boundPort));
  });
  process.env.AUTH_GRPC_HOST = '127.0.0.1';
  process.env.AUTH_GRPC_PORT = String(port);
  const clients = require('../src/clients/grpc-clients');
  t.after(() => { clients.closeGrpcClients(); server.forceShutdown(); });
  assert.equal((await clients.callRpc('auth', 'login', { email: 'c@c.com', password: '123' }, 'demo-123')).userId, '1');
  assert.equal(receivedId, 'demo-123');
  assert.deepEqual(await clients.checkServiceHealth('auth', 'health-123'), { name: 'auth-service', s: 'UP' });
  assert.equal(receivedId, 'health-123');
  health = 'DOWN';
  assert.equal((await clients.checkServiceHealth('auth')).s, 'DOWN');
  hang = true;
  const start = Date.now();
  assert.equal((await clients.checkServiceHealth('auth')).s, 'DOWN');
  assert.ok(Date.now() - start < 1000);
  for (const key of Object.keys(clients.SERVICE_DEFINITIONS)) assert.ok(clients.getBusinessClient(key));
});

test('callUnary cancels a stalled RPC and excludes unsafe correlation metadata', async () => {
  const { callUnary } = require('../src/clients/grpc-clients');
  let canceled = false;
  const fakeClient = {
    check(_request, metadata, options, _callback) {
      assert.equal(metadata.get('x-correlation-id').length, 0);
      assert.ok(options.deadline instanceof Date);
      return { cancel() { canceled = true; } };
    },
  };
  await assert.rejects(callUnary(fakeClient, 'check', {}, 10, 'unsafe id'), (error) => error.code === grpc.status.DEADLINE_EXCEEDED);
  assert.equal(canceled, true);
});
