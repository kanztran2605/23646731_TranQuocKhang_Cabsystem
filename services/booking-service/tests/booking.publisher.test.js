'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publisherModuleId =
  require.resolve(
    '../../../shared/rabbitmq/publisher',
  );

let captured = null;
const published = [];
const trips = [];

require.cache[publisherModuleId] = {
  id: publisherModuleId,
  filename: publisherModuleId,
  loaded: true,
  exports: {
    publishEvent(input) {
      captured = input;
      published.push(input);
      if (input.eventType === 'driver.accepted') {
        trips.push({ bookingId: input.payload.bookingId });
      }
      return Promise.resolve(input);
    },
  },
};

const {
  stableEventId,
  publishBookingCreated,
  publishOfferCreated,
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
    customerUserId: '10',
    createdAt: '2026-10-03T08:00:00.000Z',
    correlationId: 'req-booking-8',
  });

  assert.equal(captured.eventType, 'booking.created');
  assert.equal(captured.producer, 'booking-service');
  assert.deepEqual(captured.payload, {
    bookingId: '8',
    customerId: '2',
    customerUserId: '10',
    createdAt: '2026-10-03T08:00:00.000Z',
  });
});

test('offer.created contains only the locked payload fields', async () => {
  await publishOfferCreated({
    driverUserId: '12',
    offerId: '8',
    bookingId: '8',
    driverId: '7',
    createdAt: '2026-10-03T08:00:00.000Z',
    correlationId: 'req-booking-8',
  });

  assert.equal(captured.eventType, 'offer.created');
  assert.equal(captured.eventId, stableEventId('offer.created:8'));
  assert.equal(captured.producer, 'booking-service');
  assert.equal(captured.occurredAt, '2026-10-03T08:00:00.000Z');
  assert.deepEqual(captured.payload, {
    recipientUserIds: ['12'],
    offerId: '8',
    bookingId: '8',
    driverId: '7',
    createdAt: '2026-10-03T08:00:00.000Z',
  });
});

test('driver.accepted has no tripId and carries all required logical references', async () => {
  await publishDriverAccepted({
    driverUserId: '12',
    assignmentId: '3',
    bookingId: '8',
    customerId: '2',
    customerUserId: '10',
    driverId: '7',
    vehicleId: '7',
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
    driverUserId: '12',
    bookingId: '8',
    customerId: '2',
    customerUserId: '10',
    driverId: '7',
    vehicleId: '7',
    acceptedAt: '2026-10-03T08:03:10.000Z',
  });
});

test('no eligible Driver persists NO_DRIVER_FOUND and emits only booking.created', async () => {
  const { fixture, input } = require('./fixture');
  const { createBookingService } = require('../src/services/booking.service');
  const f = fixture(); f.state.candidates = [];
  const service = createBookingService({ ...f, publish: { publishBookingCreated, publishOfferCreated, publishDriverAccepted } });
  published.length = 0; trips.length = 0;
  const result = await service.createBooking(input());
  assert.equal(result.status, 'NO_DRIVER_FOUND');
  assert.deepEqual(f.state.offers, []); assert.deepEqual(f.state.assignments, []); assert.deepEqual(trips, []);
  assert.deepEqual(published.map(event => event.eventType), ['booking.created']);
});
