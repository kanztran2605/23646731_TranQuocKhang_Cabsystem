'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCorrelationId, correlationId } = require('../correlation');
const { redact, createLogger } = require('../logging/logger');
const { grpcToAppError } = require('../errors/grpc-error');
const { AppError } = require('../errors/app-error');
const loader = require('../grpc/loader');

test('correlation IDs accept safe bounded tokens and replace untrusted input', () => {
  assert.equal(normalizeCorrelationId(' demo-123 '), 'demo-123');
  for (const value of ['', '\r\nheader', '<script>', 'x'.repeat(129), 'unicode-\u2603', null]) {
    assert.equal(normalizeCorrelationId(value), null);
    assert.match(correlationId(value), /^[0-9a-f-]{36}$/);
  }
});

test('recursive logging redacts public password aliases and configured credentials', () => {
  const fields = ['pw', 'pw_hash', 'password_hash', 'JWT_SECRET', 'DATA_ENCRYPTION_KEY_BASE64', 'driverLicense', 'decryptedLicense',
    'POSTGRES_PASSWORD', 'MONGO_PASSWORD', 'RABBITMQ_PASSWORD', 'REDIS_PASSWORD', 'authorization', 'accessToken',
    'lic', 'license', 'lic_enc', 'driver_license_ciphertext', 'DATA_ENCRYPTION_LEGACY_KEY_BASE64'];
  const input = { correlationId: 'demo-123', nested: [Object.fromEntries(fields.map((key) => [key, 'private']))] };
  const output = redact(input);
  assert.equal(output.correlationId, 'demo-123');
  for (const field of fields) assert.equal(output.nested[0][field], '[REDACTED]');
  assert.ok(!JSON.stringify(output).includes('private'));
  const error = new Error('password=private');
  error.code = 'EFAIL';
  assert.equal(redact(error).code, 'EFAIL');
  assert.ok(!JSON.stringify(redact(error)).includes('private'));
});

test('structured logger retains correlation ID and omits credential values', () => {
  const writes = [];
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (line) => { writes.push(String(line)); return true; };
    createLogger('api-gateway', { correlationId: 'demo-123' }).info('request', { pw: 'private', JWT_SECRET: 'private' });
  } finally { process.stdout.write = originalWrite; }
  const record = JSON.parse(writes[0]);
  assert.equal(record.correlationId, 'demo-123');
  assert.equal(record.pw, '[REDACTED]');
  assert.ok(!writes[0].includes('private'));
});

test('gRPC status mapping preserves semantics without leaking downstream details', () => {
  for (const [code, expected] of [[3,400],[11,400],[16,401],[7,403],[5,404],[6,409],[9,409],[10,409],[8,429],[14,503],[4,504],[12,502],[13,500]]) {
    const result = grpcToAppError({ code, details: 'DB password=private' });
    assert.equal(result.statusCode, expected);
    assert.ok(!JSON.stringify(result.toResponse()).includes('private'));
  }
  const existing = AppError.forbidden();
  assert.equal(grpcToAppError(existing), existing);
});

test('shared proto loading restricts paths and preserves descriptive camelCase fields', () => {
  assert.throws(() => loader.resolveProtoPath('../README.md'));
  assert.throws(() => loader.resolveProtoPath('auth.txt'));
  assert.throws(() => loader.resolveProtoPath('missing.proto'));
  const methods = loader.getServiceDefinition('booking.proto', 'cab.booking.v1', 'BookingService');
  const spec = Object.values(methods).find((value) => value.originalName === 'createBooking');
  const request = {
    context: { actorUserId: '1', actorRole: 'CUSTOMER', correlationId: 'demo-123' },
    pickup: { latitude: 10.76, longitude: 106.68 },
    destination: { latitude: 10.77, longitude: 106.69 }, vehicleType: 'CAR',
  };
  assert.deepEqual(spec.requestDeserialize(spec.requestSerialize(request)), request);
});

test('shared RabbitMQ registry contains exactly the canonical keys and excludes Gateway producers', async () => {
  const connectionId = require.resolve('../rabbitmq/connection');
  const previous = require.cache[connectionId];
  require.cache[connectionId] = { id: connectionId, filename: connectionId, loaded: true, exports: { EXCHANGE: 'cab.events' } };
  try {
    const publisher = require('../rabbitmq/publisher');
    assert.deepEqual(Object.keys(publisher.EVENT_PRODUCERS), [
      'booking.created', 'offer.created', 'driver.accepted', 'driver.approval.changed',
      'trip.status.changed', 'trip.canceled', 'trip.completed', 'payment.completed',
    ]);
    const input = { eventType: 'booking.created', payload: { bookingId: '6', customerId: '1', customerUserId: '13', createdAt: '2026-10-04T01:00:00Z' } };
    assert.deepEqual(Object.keys(publisher.createEventEnvelope(input)), ['eventId', 'eventType', 'occurredAt', 'payload']);
    assert.throws(() => publisher.createEventEnvelope({ eventType: 'unsupported', payload: {} }));
    await assert.rejects(publisher.publishEvent({ ...input, producer: 'api-gateway' }), /Invalid producer/);
  } finally {
    if (previous) require.cache[connectionId] = previous;
    else delete require.cache[connectionId];
    delete require.cache[require.resolve('../rabbitmq/publisher')];
  }
});
