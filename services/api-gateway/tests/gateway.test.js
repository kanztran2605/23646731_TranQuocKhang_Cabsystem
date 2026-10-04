'use strict';

process.env.JWT_SECRET = 'gateway-test-secret';
process.env.REDIS_PASSWORD = 'gateway-test-redis';
process.env.LOG_LEVEL = 'error';
process.env.GRPC_HEALTH_TIMEOUT_MS = '40';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { once } = require('node:events');
const { createApp } = require('../src/app');
const { RATE_LIMIT_SCRIPT } = require('../src/middleware/rate-limit.middleware');
const env = require('../src/config/env');
const { SERVICE_DEFINITIONS } = require('../src/config/grpc');
const { getServiceDefinition } = require('../../../shared/grpc/loader');
const { AppError } = require('../../../shared/errors/app-error');

const pickup = { latitude: 10.76, longitude: 106.68 };
const booking = { bookingId: '6', customerId: '1', pickup, destination: pickup, vehicleType: 'CAR', status: 'SEARCHING' };
const driver = {
  driverId: '1', userId: '2', name: 'D', approvalStatus: 'APPROVED', availabilityStatus: 'AVAILABLE',
  vehicle: { vehicleId: '1', driverId: '1', vehicleType: 'CAR', licensePlate: '51A1', status: 'ACTIVE' },
  location: { driverId: '1', ...pickup },
};
const trip = { tripId: '1', bookingId: '6', customerId: '1', driverId: '1', status: 'ASSIGNED', paid: false };
const payment = { paymentId: '1', bookingId: '6', customerId: '1', amount: 50000, status: 'PENDING', eligible: false };
const fixtures = {
  'auth.createAccount': { userId: '5', email: 'newd@d.com', role: 'DRIVER' },
  'auth.login': { userId: '1', role: 'CUSTOMER', accessToken: 'test-token', expiresInSeconds: '3600' },
  'customer.createCustomerProfile': { customerId: '5', userId: '5', name: 'C' },
  'customer.getCustomer': { customerId: '1', userId: '1', name: 'C', address: 'HCMC' },
  'driver.requestOtp': { otp: '123' },
  'driver.registerDriver': { ...driver, driverId: '5', userId: '5', approvalStatus: 'PENDING_APPROVAL' },
  'driver.getDriver': driver,
  'driver.getDriverByUserId': driver,
  'driver.listPendingDrivers': { page: 1, limit: 5, total: '1', items: [driver] },
  'driver.reviewDriverApproval': driver,
  'driver.setAvailability': driver,
  'driver.updateLocation': { driverId: '1', ...pickup },
  'driver.getNearbyDrivers': { page: 1, limit: 5, total: '1', items: [driver] },
  'driver.listVehicleTypes': { items: [{ vehicleType: 'CAR', name: 'Car' }] },
  'booking.createBooking': booking,
  'booking.getBooking': booking,
  'booking.listMyBookings': { page: 1, limit: 2, total: '1', items: [booking] },
  'booking.listMyOffers': { items: [{ offerId: '1', bookingId: '6', driverId: '1', vehicleId: '1', status: 'OPEN' }] },
  'booking.acceptOffer': { offerId: '1', bookingId: '6', offerStatus: 'ACCEPTED', tripPending: true },
  'trip.getTrip': trip,
  'trip.getTripByBooking': trip,
  'trip.updateTripStatus': { ...trip, status: 'ARRIVED' },
  'trip.updateTripLocation': { locationId: '1', tripId: '1', ...pickup },
  'trip.cancelTrip': { ...trip, status: 'CANCELED', cancelReason: 'x' },
  'payment.getPayment': payment,
  'payment.getPaymentByBooking': payment,
  'payment.payExistingPayment': { ...payment, idempotencyKey: 'P1', eligible: true },
  'payment.paymentCallback': { ...payment, status: 'COMPLETED', eligible: true },
  'notification.listNotifications': { items: [{
    notificationId: 'n1', sourceEventId: 'e1', recipientUserId: '1', type: 'PAYMENT_COMPLETED',
    reference: 'pid:1', message: 'Payment completed', status: 'SENT', createdAt: '2026-10-04T01:00:00Z',
  }] },
  'review.createReview': { reviewId: '1', tripId: '1', customerId: '1', driverId: '1', score: 5, comment: 'ok' },
};
const definitions = Object.fromEntries(Object.entries(SERVICE_DEFINITIONS).map(([key, value]) => [
  key, getServiceDefinition(value.protoFile, value.packageName, value.serviceName),
]));

function token(role = 'CUSTOMER', options = {}) {
  return jwt.sign({ role }, process.env.JWT_SECRET, { subject: '1', expiresIn: 3600, ...options });
}

async function harness(t, overrides = {}) {
  const calls = [];
  const redisOps = [];
  const app = createApp({
    redisClient: () => ({
      isReady: true,
      eval: async (script, options) => { redisOps.push({ script, options }); return [1, 10000]; },
    }),
    pingRedis: async () => true,
    checkServiceHealth: async () => ({ s: 'UP' }),
    callRpc: async (service, method, payload, correlationId) => {
      const spec = Object.values(definitions[service]).find((item) => item.originalName === method);
      assert.ok(spec, service + '.' + method + ' must exist in the current proto');
      // Exercise the real proto serializers: stale field names cannot pass these mapping assertions.
      const wire = spec.requestDeserialize(spec.requestSerialize(payload));
      calls.push({ service, method, payload, wire, correlationId });
      return spec.responseDeserialize(spec.responseSerialize(fixtures[service + '.' + method]));
    },
    ...overrides,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(path, { method = 'GET', role = 'CUSTOMER', bearer, body, headers = {} } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(role ? { authorization: 'Bearer ' + (bearer ?? token(role)) } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return { request, calls, redisOps };
}

test('Gateway configuration and registry match the locked baseline', () => {
  assert.equal(env.GATEWAY_PORT, 8080);
  assert.equal(env.JWT_ACCESS_TTL_SECONDS, 3600);
  assert.equal(env.RATE_LIMIT_WINDOW_MS, 10000);
  assert.equal(env.RATE_LIMIT_MAX_REQUESTS, 3);
  assert.deepEqual(Object.keys(SERVICE_DEFINITIONS), ['auth', 'customer', 'driver', 'booking', 'trip', 'payment', 'notification', 'review']);
  for (const [key, service] of Object.entries(SERVICE_DEFINITIONS)) {
    assert.equal(service.host, key + '-service');
    assert.ok(Object.keys(definitions[key]).length > 0);
  }
});

test('JWT signature/expiry and required claims are verified before any RPC', async (t) => {
  const { request, calls } = await harness(t);
  assert.equal((await request('/api/v1/customers/1')).status, 200);
  const valid = token();
  const parts = valid.split('.');
  parts[1] = Buffer.from(JSON.stringify({ sub: '1', role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const invalidTokens = [
    'garbage', parts.join('.'), valid.slice(0, -8) + 'abcdefgh',
    token('CUSTOMER', { expiresIn: -1 }),
    jwt.sign({ role: 'CUSTOMER', sub: '1' }, process.env.JWT_SECRET),
    token('UNKNOWN'),
  ];
  for (const bearer of invalidTokens) {
    const result = await request('/api/v1/customers/1', { bearer });
    assert.equal(result.status, 401);
    assert.deepEqual(Object.keys(result.body), ['code', 'message', 'at']);
  }
  assert.equal((await request('/api/v1/customers/1', { role: null })).status, 401);
  assert.equal(calls.length, 1);
});

test('the same Driver-by-ID endpoint enforces Admin 200 and Customer 403', async (t) => {
  const { request, calls } = await harness(t);
  const admin = await request('/api/v1/drivers/1', { role: 'ADMIN' });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.did, 1);
  assert.equal(admin.body.ap, 'APPROVED');
  assert.equal((await request('/api/v1/drivers/1')).status, 403);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'getDriver');
  assert.equal(calls[0].wire.driverId, '1');
});

const routeCases = [
  ['POST', '/register', null, { email: 'n@c.com', pw: '123', name: 'C' }, 'customer', 'createCustomerProfile', { userId: '5', name: 'C' }, 201, 'cid', 5],
  ['POST', '/login', null, { email: 'c@c.com', pw: '123' }, 'auth', 'login', { email: 'c@c.com', password: '123' }, 200, 'token', 'test-token'],
  ['GET', '/customers/1', 'CUSTOMER', undefined, 'customer', 'getCustomer', { customerId: '1' }, 200, 'cid', 1],
  ['POST', '/drivers/otp', null, { email: 'newd@d.com' }, 'driver', 'requestOtp', { email: 'newd@d.com' }, 200, 'otp', '123'],
  ['POST', '/drivers/register', null, { email: 'newd@d.com', pw: '123', otp: '123', name: 'D', vt: 'CAR', plate: '51A1' }, 'driver', 'registerDriver', { userId: '5', otp: '123', vehicleType: 'CAR', licensePlate: '51A1' }, 201, 'ap', 'PENDING_APPROVAL'],
  ['GET', '/drivers/pending-approval', 'ADMIN', undefined, 'driver', 'listPendingDrivers', { page: 1, limit: 5 }, 200, 'limit', 5],
  ['GET', '/drivers/nearby?lat=10.76&lng=106.68', 'ADMIN', undefined, 'driver', 'getNearbyDrivers', { latitude: 10.76, longitude: 106.68, radiusKm: 1, page: 1, limit: 5 }, 200, 'page', 1],
  ['PATCH', '/drivers/1/approval', 'ADMIN', { ap: 'REJECTED' }, 'driver', 'reviewDriverApproval', { driverId: '1', approvalStatus: 'REJECTED' }, 200, 'did', 1],
  ['PATCH', '/drivers/me/availability', 'DRIVER', { on: true }, 'driver', 'setAvailability', { online: true }, 200, 'av', 'AVAILABLE'],
  ['PUT', '/drivers/me/location', 'DRIVER', { lat: 10.76, lng: 106.68 }, 'driver', 'updateLocation', { latitude: 10.76, longitude: 106.68 }, 200, 'lat', 10.76],
  ['GET', '/vehicle-types', 'CUSTOMER', undefined, 'driver', 'listVehicleTypes', {}, 200, null, null],
  ['POST', '/bookings', 'CUSTOMER', { p: { lat: 10.76, lng: 106.68 }, d: { lat: 10.76, lng: 106.68 }, vt: 'CAR' }, 'booking', 'createBooking', { pickup, destination: pickup, vehicleType: 'CAR' }, 201, 'bid', 6],
  ['GET', '/bookings/6', 'CUSTOMER', undefined, 'booking', 'getBooking', { bookingId: '6' }, 200, 'bid', 6],
  ['GET', '/customers/me/bookings', 'CUSTOMER', undefined, 'booking', 'listMyBookings', { page: 1, limit: 2 }, 200, 'limit', 2],
  ['GET', '/drivers/me/offers', 'DRIVER', undefined, 'booking', 'listMyOffers', {}, 200, null, null],
  ['POST', '/offers/1/accept', 'DRIVER', undefined, 'booking', 'acceptOffer', { offerId: '1' }, 200, 'tripPending', true],
  ['GET', '/trips/by-booking/6', 'CUSTOMER', undefined, 'trip', 'getTripByBooking', { bookingId: '6' }, 200, 'tid', 1],
  ['GET', '/trips/1', 'DRIVER', undefined, 'trip', 'getTrip', { tripId: '1' }, 200, 'tid', 1],
  ['PATCH', '/trips/1/status', 'DRIVER', { s: 'ARRIVED' }, 'trip', 'updateTripStatus', { tripId: '1', status: 'ARRIVED' }, 200, 's', 'ARRIVED'],
  ['PATCH', '/trips/1/location', 'DRIVER', { lat: 10.76, lng: 106.68 }, 'trip', 'updateTripLocation', { tripId: '1', latitude: 10.76, longitude: 106.68 }, 200, 'lat', 10.76],
  ['POST', '/trips/1/cancel', 'CUSTOMER', { r: 'x' }, 'trip', 'cancelTrip', { tripId: '1', reason: 'x' }, 200, 'r', 'x'],
  ['GET', '/payments/by-booking/6', 'CUSTOMER', undefined, 'payment', 'getPaymentByBooking', { bookingId: '6' }, 200, 'amt', 50000],
  ['GET', '/payments/1', 'CUSTOMER', undefined, 'payment', 'getPayment', { paymentId: '1' }, 200, 'eligible', false],
  ['POST', '/payments/1/pay', 'CUSTOMER', undefined, 'payment', 'payExistingPayment', { paymentId: '1', idempotencyKey: 'P1' }, 200, 'key', 'P1'],
  ['POST', '/payments/1/callback', 'ADMIN', { s: 'COMPLETED' }, 'payment', 'paymentCallback', { paymentId: '1', status: 'COMPLETED' }, 200, 's', 'COMPLETED'],
  ['GET', '/notifications', 'CUSTOMER', undefined, 'notification', 'listNotifications', { limit: 5 }, 200, null, null],
  ['POST', '/trips/1/reviews', 'CUSTOMER', { star: 5, c: 'ok' }, 'review', 'createReview', { tripId: '1', score: 5, comment: 'ok' }, 201, 'star', 5],
];

test('every public REST route uses current proto methods, fields and short response aliases', async (t) => {
  const { request, calls, redisOps } = await harness(t);
  for (const [method, path, role, body, service, rpc, fields, status, alias, value] of routeCases) {
    await t.test(method + ' ' + path, async () => {
      calls.length = 0;
      const result = await request('/api/v1' + path, {
        method, role, body, headers: { 'x-correlation-id': 'demo-123', 'Idempotency-Key': 'P1' },
      });
      assert.equal(result.status, status);
      if (alias) assert.equal(result.body[alias], value);
      const called = calls.find((item) => item.service === service && item.method === rpc);
      assert.ok(called);
      for (const [field, expected] of Object.entries(fields)) assert.deepEqual(called.wire[field], expected);
      assert.equal(called.correlationId, 'demo-123');
      if (role) {
        assert.equal(called.wire.context.actorRole, role);
        assert.equal(called.wire.context.actorUserId, '1');
        assert.equal(called.wire.context.correlationId, 'demo-123');
        assert.ok(!('permissions' in called.payload.context));
      }
      assert.equal(result.headers.get('x-correlation-id'), 'demo-123');
      if (path === '/register' || path === '/drivers/register') {
        assert.equal(calls[0].method, 'createAccount');
        assert.equal(calls[0].wire.role, path === '/register' ? 'CUSTOMER' : 'DRIVER');
        assert.equal(calls[0].wire.password, '123');
      }
      if (path === '/drivers/me/location') assert.deepEqual(calls.map((item) => item.method), ['updateLocation', 'getDriverByUserId']);
      assert.ok(!JSON.stringify(result.body).includes('password'));
    });
  }
  assert.equal(redisOps.length, routeCases.length);
  for (const operation of redisOps) {
    assert.equal(operation.script, RATE_LIMIT_SCRIPT);
    assert.match(operation.options.keys[0], /^cab:gateway:ratelimit:api:/);
    assert.deepEqual(operation.options.arguments, ['10000']);
  }
});

test('all documented role restrictions reject other roles before a business RPC', async (t) => {
  const { request, calls } = await harness(t);
  for (const [method, path, role, body] of routeCases) {
    if (!role || ['/customers/1', '/vehicle-types', '/bookings/6', '/trips/1', '/trips/by-booking/6', '/payments/1', '/notifications'].includes(path)) continue;
    const wrongRole = role === 'DRIVER' ? 'CUSTOMER' : 'DRIVER';
    assert.equal((await request('/api/v1' + path, { method, role: wrongRole, body })).status, 403, path);
  }
  assert.equal(calls.length, 0);
});

test('transport validation rejects malformed input without a business RPC', async (t) => {
  const { request, calls } = await harness(t);
  const badCases = [
    ['/login', 'POST', null, { email: "' OR 1=1 --", pw: 'x' }],
    ['/register', 'POST', null, { email: 'n@c.com', pw: '12', name: 'C' }],
    ['/register', 'POST', null, { email: 'n@c.com', pw: '123', name: '   ' }],
    ['/register', 'POST', null, { email: 'n@c.com', pw: '   ', name: 'C' }],
    ['/bookings', 'POST', 'CUSTOMER', { p: { lat: 91, lng: 0 }, d: { lat: 0, lng: 0 }, vt: 'CAR' }],
    ['/bookings', 'POST', 'CUSTOMER', { p: { lat: 0, lng: 0 }, d: { lat: 0, lng: 0 }, vt: 1 }],
    ['/bookings', 'POST', 'CUSTOMER', { p: { lat: 0, lng: 0 }, d: { lat: 0, lng: 0 }, vt: '1' }],
    ['/drivers/nearby?lat=&lng=1', 'GET', 'ADMIN'],
    ['/drivers/pending-approval?limit=21', 'GET', 'ADMIN'],
    ['/drivers/me/availability', 'PATCH', 'DRIVER', { on: 'true' }],
    ['/trips/1/status', 'PATCH', 'DRIVER', { s: 'invalid-state' }],
    ['/trips/1/cancel', 'POST', 'CUSTOMER', { r: '' }],
    ['/trips/1/reviews', 'POST', 'CUSTOMER', { star: 6 }],
    ['/trips/1/reviews', 'POST', 'CUSTOMER', { star: 5, c: 'x'.repeat(256) }],
    ['/payments/1/pay', 'POST', 'CUSTOMER'],
    ['/payments/1/callback', 'POST', 'ADMIN', { s: 'PENDING' }],
    ['/customers/not-an-id', 'GET', 'CUSTOMER'],
    ['/customers/9223372036854775808', 'GET', 'CUSTOMER'],
    ['/notifications?limit=0', 'GET', 'CUSTOMER'],
    ['/login', 'POST', null, '{"pw":"secret",'],
  ];
  for (const [path, method, role, body] of badCases) {
    const result = await request('/api/v1' + path, { method, role, body });
    assert.equal(result.status, 400, path);
  }
  assert.equal(calls.length, 0);
});

test('fourth request gets 429 for ten seconds; Redis holds only rate counters', async (t) => {
  let now = 0;
  const counters = new Map();
  const { request } = await harness(t, {
    redisClient: () => ({
      isReady: true,
      eval: async (_script, { keys, arguments: args }) => {
        const key = keys[0];
        if (!counters.has(key) || counters.get(key).expires <= now) counters.set(key, { count: 0, expires: now + Number(args[0]) });
        const counter = counters.get(key);
        return [++counter.count, counter.expires - now];
      },
    }),
  });
  for (let i = 0; i < 3; i++) assert.equal((await request('/api/v1/vehicle-types')).status, 200);
  now = 9999;
  const fourth = await request('/api/v1/vehicle-types');
  assert.equal(fourth.status, 429);
  assert.equal(fourth.headers.get('RateLimit-Limit'), '3');
  assert.equal(fourth.headers.get('RateLimit-Remaining'), '0');
  assert.equal((await request('/health')).status, 200);
  now = 10000;
  assert.equal((await request('/api/v1/vehicle-types')).status, 200);
  assert.equal(counters.size, 1);
  assert.match([...counters.keys()][0], /^cab:gateway:ratelimit:api:/);
});

test('Redis unavailable fails fast with 503 and does not call a business service', async (t) => {
  const { request, calls } = await harness(t, { redisClient: () => ({ isReady: false }) });
  assert.equal((await request('/api/v1/vehicle-types')).status, 503);
  assert.equal(calls.length, 0);
  assert.equal((await request('/health')).status, 200);
});

test('health is process-alive; ready checks Redis and every required gRPC service', async (t) => {
  let redisReady = true;
  let downService;
  const { request } = await harness(t, {
    pingRedis: async () => redisReady,
    checkServiceHealth: async (key) => ({ s: key === downService ? 'DOWN' : 'UP' }),
  });
  for (const prefix of ['', '/api/v1']) {
    assert.deepEqual((await request(prefix + '/health')).body, { s: 'UP' });
    assert.equal((await request(prefix + '/ready')).status, 200);
    const result = await request(prefix + '/health/services');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.services.map((item) => item.name), Object.values(SERVICE_DEFINITIONS).map((item) => item.name));
    assert.equal(result.body.services.length, 8);
    assert.equal(result.body.s, 'UP');
  }
  redisReady = false;
  assert.equal((await request('/ready')).status, 503);
  redisReady = true;
  downService = 'trip';
  assert.equal((await request('/ready')).status, 503);
  const degraded = await request('/health/services');
  assert.equal(degraded.body.services.find((item) => item.name === 'trip-service').s, 'DOWN');
  assert.equal(degraded.body.s, 'DOWN');
  assert.equal((await request('/health')).status, 200);
});

test('unresponsive dependencies have a bounded readiness/service-health timeout', async (t) => {
  const { request } = await harness(t, {
    pingRedis: () => new Promise(() => {}),
    checkServiceHealth: () => new Promise(() => {}),
  });
  const start = Date.now();
  assert.equal((await request('/ready')).status, 503);
  const result = await request('/health/services');
  assert.equal(result.body.services.length, 8);
  assert.ok(result.body.services.every((item) => item.s === 'DOWN'));
  assert.ok(Date.now() - start < 1000);
});

test('consistent downstream errors preserve status without exposing internal details', async (t) => {
  let code;
  const { request } = await harness(t, {
    callRpc: async () => { throw { code, details: 'password=secret database internals' }; },
  });
  for (const [grpcCode, status] of [[3, 400], [16, 401], [7, 403], [5, 404], [6, 409], [9, 409], [10, 409], [8, 429], [14, 503], [4, 504], [12, 502], [13, 500]]) {
    code = grpcCode;
    const result = await request('/api/v1/customers/1');
    assert.equal(result.status, status);
    assert.ok(!JSON.stringify(result.body).includes('secret'));
  }
});

test('business ownership/state conflicts are delegated and never replaced with Gateway success', async (t) => {
  const calls = [];
  const { request } = await harness(t, {
    callRpc: async (...args) => { calls.push(args); throw AppError.forbidden(); },
  });
  for (const [path, method, role, body] of [
    ['/trips/1/status', 'PATCH', 'DRIVER', { s: 'COMPLETED' }],
    ['/trips/1/cancel', 'POST', 'CUSTOMER', { r: 'x' }],
    ['/trips/1/reviews', 'POST', 'CUSTOMER', { star: 5, c: '<script>alert(1)</script>' }],
  ]) {
    assert.equal((await request('/api/v1' + path, { method, role, body })).status, 403);
  }
  assert.equal(calls.length, 3);
  assert.equal(calls[0][2].status, 'COMPLETED'); // No Gateway state machine or prefetch.
  assert.equal(calls[2][2].comment, '<script>alert(1)</script>'); // Review service owns storage safety.
});

test('safe correlation IDs are reused, invalid values replaced, and query credentials omitted from error logs', async (t) => {
  const { request, calls } = await harness(t);
  const writes = [];
  const original = process.stdout.write;
  const originalLevel = process.env.LOG_LEVEL;
  // Request loggers were created at error level; capture an error as well as response/context IDs.
  const originalError = process.stderr.write;
  process.stderr.write = (line) => { writes.push(String(line)); return true; };
  t.after(() => { process.stdout.write = original; process.stderr.write = originalError; process.env.LOG_LEVEL = originalLevel; });
  const fallback = await request('/api/v1/customers/1?pw=do-not-log', { headers: { 'x-correlation-id': 'invalid id' } });
  assert.match(fallback.headers.get('x-correlation-id'), /^[0-9a-f-]{36}$/);
  assert.equal(calls.at(-1).wire.context.correlationId, fallback.headers.get('x-correlation-id'));
  const reused = await request('/api/v1/customers/1', { headers: { 'x-request-id': 'request-123' } });
  assert.equal(reused.headers.get('x-correlation-id'), 'request-123');
  const failing = await harness(t, { callRpc: async () => { throw AppError.internal('password=do-not-log'); } });
  const error = await failing.request('/api/v1/customers/1?pw=do-not-log', { headers: { 'x-correlation-id': 'error-123' } });
  assert.equal(error.status, 500);
  assert.ok(writes.length > 0);
  assert.equal(JSON.parse(writes.at(-1)).correlationId, 'error-123');
  assert.ok(!writes.join('').includes('do-not-log'));
});

test('obsolete routes are unavailable and Gateway imports no domain storage/events', async (t) => {
  const { request, calls } = await harness(t);
  for (const path of ['/auth/refresh', '/auth/logout', '/users/me', '/vehicles', '/offers/1/reject', '/reports', '/audits']) {
    assert.equal((await request('/api/v1' + path)).status, 404, path);
  }
  assert.equal(calls.length, 0);
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of fs.readdirSync(path.resolve(__dirname, '../src'), { recursive: true }).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');
    assert.doesNotMatch(source, /require\(['"][^'"]*(?:rabbitmq|repositories|\/domain\/|mongoose|pg['"])/);
  }
});
