'use strict';
// Explicit Docker smoke test against the three real services and RabbitMQ.
// Run manually; terminal Trip messages below are contract test fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { createClient } = require('../../../shared/grpc/loader');
const { createChannel, closeConnection, EXCHANGE } = require('../../../shared/rabbitmq/connection');
const { publishEvent, closePublisher } = require('../../../shared/rabbitmq/publisher');
const bookingDriver = require('../../booking-service/src/grpc/driver.client');

function client(name, port, serviceName) {
  return createClient({ protoFile: name + '.proto', packageName: 'cab.' + name + '.v1', serviceName,
    address: process.env[name.toUpperCase() + '_GRPC_HOST'] + ':' + port });
}
function call(target, method, request) {
  return new Promise((resolve, reject) => target[method](request, { deadline: new Date(Date.now() + 3000) },
    (error, response) => error ? reject(error) : resolve(response)));
}
async function until(read, predicate) {
  const deadline = Date.now() + 3000;
  do {
    const value = await read();
    if (predicate(value)) return value;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error('Smoke test timed out waiting for the contracted result');
}

test('real Auth/Customer/Driver and RabbitMQ smoke', { timeout: 30000 }, async (t) => {
  const auth = client('auth', 50051, 'AuthService');
  const customer = client('customer', 50052, 'CustomerService');
  const driver = client('driver', 50053, 'DriverService');
  const clients = [auth, customer, driver];
  let channel;
  t.after(async () => {
    for (const current of clients) current.close();
    bookingDriver.closeDriverClient();
    if (channel) await channel.close();
    await closePublisher();
    await closeConnection();
  });
  const admin = { actorUserId: '7', actorRole: 'ADMIN', correlationId: 'stack-smoke' };
  let customerId, owner, driverId;

  await t.test('all three real HealthService checks are UP', async () => {
    for (const [name, port] of [['auth', 50051], ['customer', 50052], ['driver', 50053]]) {
      const health = createClient({ protoFile: 'common/common.proto', packageName: 'cab.common.v1',
        serviceName: 'HealthService', address: process.env[name.toUpperCase() + '_GRPC_HOST'] + ':' + port });
      clients.push(health);
      assert.equal((await call(health, 'check', {})).status, 'UP');
    }
  });
  await t.test('canonical seeded login and independent Customer profile creation work', async () => {
    for (const [email, role] of [['c@c.com', 'CUSTOMER'], ['d@d.com', 'DRIVER'], ['a@a.com', 'ADMIN']]) {
      const login = await call(auth, 'login', { email, password: '123' });
      assert.equal(login.role, role);
      assert.equal(login.expiresInSeconds, '3600');
      assert.ok(login.accessToken);
      assert.equal(login.passwordHash, undefined);
    }
    await assert.rejects(call(auth, 'login', { email: "' OR 1=1 --", password: '123' }), (e) => e.code === 16);
    const suffix = Date.now();
    const account = await call(auth, 'createAccount', { email: 'smoke-c-' + suffix + '@example.test', password: '123', role: 'CUSTOMER' });
    const profile = await call(customer, 'createCustomerProfile', { userId: account.userId, name: 'Smoke Customer', address: 'HCMC' });
    customerId = profile.customerId;
    assert.equal((await call(customer, 'validateCustomer', { customerId })).valid, true);
    assert.equal((await call(customer, 'getCustomerByUserId', { userId: account.userId })).customerId, customerId);
    assert.equal((await call(customer, 'getCustomer', { context: { actorUserId: account.userId, actorRole: 'CUSTOMER' }, customerId })).name, 'Smoke Customer');
  });
  await t.test('real onboarding and Admin approval publish the canonical RabbitMQ event', async () => {
    channel = await createChannel();
    const queue = (await channel.assertQueue('', { exclusive: true, autoDelete: true })).queue;
    await channel.bindQueue(queue, EXCHANGE, 'driver.approval.changed');
    const suffix = Date.now();
    const account = await call(auth, 'createAccount', { email: 'smoke-d-' + suffix + '@example.test', password: '123', role: 'DRIVER' });
    owner = { actorUserId: account.userId, actorRole: 'DRIVER', correlationId: 'stack-smoke' };
    assert.equal((await call(driver, 'requestOtp', { email: account.email })).otp, '123');
    const profile = await call(driver, 'registerDriver', { context: owner, userId: account.userId, otp: '123',
      name: 'Smoke Driver', vehicleType: 'CAR', licensePlate: 'S' + suffix, driverLicense: 'SMOKE-LICENSE' });
    driverId = profile.driverId;
    owner.actorDriverId = driverId;
    assert.equal(profile.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(profile.availabilityStatus, 'OFFLINE');
    await assert.rejects(call(driver, 'setAvailability', { context: owner, online: true }), (e) => e.code === 9);
    assert.equal((await call(driver, 'reviewDriverApproval', { context: admin, driverId, approvalStatus: 'APPROVED' })).approvalStatus, 'APPROVED');
    const message = await until(() => channel.get(queue, { noAck: true }), Boolean);
    const event = JSON.parse(message.content.toString('utf8'));
    assert.equal(event.eventType, 'driver.approval.changed');
    assert.equal(message.fields.routingKey, 'driver.approval.changed');
    assert.equal(event.payload.driverId, driverId);
    assert.equal(event.payload.approvalStatus, 'APPROVED');
  });
  await t.test('Booking client reserves Driver; real terminal Trip consumers release BUSY', async () => {
    await call(driver, 'setAvailability', { context: owner, online: true });
    assert.equal((await bookingDriver.getMyDriverProfile(owner)).driverId, driverId);
    const consumer = await channel.checkQueue('cab.driver.q');
    assert.equal(consumer.consumerCount, 1);
    for (const eventType of ['trip.completed', 'trip.canceled']) {
      assert.equal((await bookingDriver.markBusyForAssignment(owner, driverId)).availabilityStatus, 'BUSY');
      await assert.rejects(bookingDriver.markBusyForAssignment(owner, driverId), (e) => e.statusCode === 409);
      const payload = eventType === 'trip.completed'
        ? { tripId: '9001', bookingId: '9001', customerId, driverId, completedAt: new Date().toISOString() }
        : { tripId: '9002', customerId, driverId, reason: 'Contract smoke fixture', canceledAt: new Date().toISOString() };
      await publishEvent({ producer: 'trip-service', eventType, payload });
      await until(() => call(driver, 'getDriverByUserId', { userId: owner.actorUserId }), (state) => state.availabilityStatus === 'AVAILABLE');
    }
  });
});
