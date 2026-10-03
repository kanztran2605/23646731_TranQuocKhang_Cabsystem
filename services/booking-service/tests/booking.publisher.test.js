'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publisherModuleId =
  require.resolve(
    '../../../shared/rabbitmq/publisher',
  );

let captured = null;

require.cache[publisherModuleId] = {
  id: publisherModuleId,
  filename: publisherModuleId,
  loaded: true,
  exports: {
    publishEvent(input) {
      captured = input;
      return Promise.resolve(input);
    },
  },
};

const {
  stableEventId,
  publishBookingCreated,
  publishDriverOfferCreated,
  publishNoDriverFound,
  publishDriverAccepted,
} = require('../src/events/booking.publisher');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('stableEventId is deterministic and UUID-compatible', () => {
  const first = stableEventId('driver.accepted:12');
  const second = stableEventId('driver.accepted:12');

  assert.equal(first, second);
  assert.match(first, UUID_PATTERN);
});

test('booking.created follows the locked event contract', async () => {
  await publishBookingCreated({
    bookingId: '8',
    customerId: '2',
    vehicleTypeId: '1',
    createdAt: '2026-10-03T08:00:00.000Z',
    correlationId: 'req-booking-8',
  });

  assert.equal(captured.eventType, 'booking.created');
  assert.equal(captured.producer, 'booking-service');
  assert.deepEqual(captured.payload, {
    bookingId: '8',
    customerId: '2',
    vehicleTypeId: '1',
    createdAt: '2026-10-03T08:00:00.000Z',
  });
});

test('driver.offer.created contains only the locked payload fields', async () => {
  await publishDriverOfferCreated({
    offerId: '8',
    bookingId: '8',
    driverId: '7',
    expiresAt: '2026-10-03T08:05:00.000Z',
    createdAt: '2026-10-03T08:00:00.000Z',
    correlationId: 'req-booking-8',
  });

  assert.deepEqual(captured.payload, {
    offerId: '8',
    bookingId: '8',
    driverId: '7',
    expiresAt: '2026-10-03T08:05:00.000Z',
    createdAt: '2026-10-03T08:00:00.000Z',
  });
});

test('booking.no_driver_found uses an official reason', async () => {
  await publishNoDriverFound({
    bookingId: '8',
    customerId: '2',
    reason: 'NO_SUITABLE_DRIVER',
    occurredAt: '2026-10-03T08:10:00.000Z',
    correlationId: 'req-booking-8',
  });

  assert.equal(captured.eventType, 'booking.no_driver_found');
  assert.equal(captured.payload.reason, 'NO_SUITABLE_DRIVER');
});

test('driver.accepted has no tripId and carries all required logical references', async () => {
  await publishDriverAccepted({
    assignmentId: '3',
    bookingId: '8',
    customerId: '2',
    driverId: '7',
    vehicleId: '7',
    vehicleTypeId: '1',
    acceptedAt: '2026-10-03T08:03:10.000Z',
    correlationId: 'req-booking-8',
  });

  assert.equal(captured.eventType, 'driver.accepted');
  assert.equal(captured.producer, 'booking-service');
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      captured.payload,
      'tripId',
    ),
    false,
  );
  assert.deepEqual(captured.payload, {
    bookingId: '8',
    customerId: '2',
    driverId: '7',
    vehicleId: '7',
    vehicleTypeId: '1',
    acceptedAt: '2026-10-03T08:03:10.000Z',
  });
});
