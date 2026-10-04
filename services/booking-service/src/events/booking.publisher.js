'use strict';

const {
  createHash,
} = require(
  'node:crypto'
);

const {
  publishEvent,
} = require(
  '../../../../shared/rabbitmq/publisher'
);

const PRODUCER =
  'booking-service';

function stableEventId(seed) {
  const hex =
    createHash('sha256')
      .update(seed)
      .digest('hex')
      .slice(0, 32)
      .split('');

  /*
   * Make the deterministic value
   * satisfy the UUID validator.
   */
  hex[12] = '5';
  hex[16] = '8';

  const value =
    hex.join('');

  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32),
  ].join('-');
}

function publishBookingCreated({
  bookingId,
  customerId,
  customerUserId,
  createdAt,
  correlationId,
}) {
  return publishEvent({
    eventId:
      stableEventId(
        `booking.created:${bookingId}`,
      ),

    eventType:
      'booking.created',

    producer:
      PRODUCER,

    correlationId,

    occurredAt:
      createdAt,

    payload: {
      bookingId:
        String(bookingId),

      customerId:
        String(customerId),
      customerUserId: String(customerUserId),

      createdAt,
    },
  });
}

function publishOfferCreated({
  offerId,
  bookingId,
  driverId,
  driverUserId,
  createdAt,
  correlationId,
}) {
  return publishEvent({
    eventId:
      stableEventId(
        `offer.created:${offerId}`,
      ),

    eventType:
      'offer.created',

    producer:
      PRODUCER,

    correlationId,

    occurredAt:
      createdAt,

    payload: {
      offerId:
        String(offerId),

      bookingId:
        String(bookingId),

      driverId:
        String(driverId),
      recipientUserIds: [String(driverUserId)],

      createdAt,
    },
  });
}

function publishDriverAccepted({
  assignmentId,
  bookingId,
  customerId,
  driverId,
  vehicleId,
  customerUserId,
  driverUserId,
  acceptedAt,
  correlationId,
}) {
  return publishEvent({
    eventId:
      stableEventId(
        `driver.accepted:${assignmentId}`,
      ),

    eventType:
      'driver.accepted',

    producer:
      PRODUCER,

    correlationId,

    occurredAt:
      acceptedAt,

    payload: {
      bookingId:
        String(bookingId),

      customerId:
        String(customerId),

      driverId:
        String(driverId),

      vehicleId:
        String(vehicleId),
      customerUserId: String(customerUserId),
      driverUserId: String(driverUserId),

      acceptedAt,
    },
  });
}

module.exports = {
  stableEventId,
  publishBookingCreated,
  publishOfferCreated,
  publishDriverAccepted,
};
