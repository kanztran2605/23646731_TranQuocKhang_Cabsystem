'use strict';

const { once } = require('node:events');
const { randomUUID } = require('node:crypto');

const {
  createLogger,
} = require('../logging/logger');

const {
  createChannel,
  EXCHANGE,
} = require('./connection');

const logger = createLogger(
  process.env.SERVICE_NAME || 'cab-system',
);

/*
 * Locked Event Ownership
 *
 * booking-service:
 * - booking.created
 * - driver.offer.created
 * - booking.no_driver_found
 * - driver.accepted
 *
 * trip-service:
 * - trip.status.changed
 * - trip.canceled
 *
 * payment-service:
 * - payment.completed
 * - payment.failed
 *
 * review-service:
 * - review.created
 */
const EVENT_PRODUCERS = Object.freeze({
  'booking.created': 'booking-service',

  'driver.offer.created':
    'booking-service',

  'booking.no_driver_found':
    'booking-service',

  'driver.accepted':
    'booking-service',

  'trip.status.changed':
    'trip-service',

  'trip.canceled':
    'trip-service',

  'payment.completed':
    'payment-service',

  'payment.failed':
    'payment-service',

  'review.created':
    'review-service',
});

const REQUIRED_PAYLOAD_FIELDS =
  Object.freeze({
    'booking.created': [
      'bookingId',
      'customerId',
      'vehicleTypeId',
      'createdAt',
    ],

    'driver.offer.created': [
      'offerId',
      'bookingId',
      'driverId',
      'expiresAt',
      'createdAt',
    ],

    'booking.no_driver_found': [
      'bookingId',
      'customerId',
      'reason',
      'occurredAt',
    ],

    'driver.accepted': [
      'bookingId',
      'customerId',
      'driverId',
      'vehicleId',
      'vehicleTypeId',
      'acceptedAt',
    ],

    'trip.status.changed': [
      'tripId',
      'bookingId',
      'customerId',
      'driverId',
      'vehicleId',
      'vehicleTypeId',
      'tripDistance',
      'fromStatus',
      'toStatus',
      'changedAt',
    ],

    'trip.canceled': [
      'tripId',
      'bookingId',
      'customerId',
      'driverId',
      'reason',
      'canceledBy',
      'canceledAt',
    ],

    'payment.completed': [
      'paymentId',
      'fareId',
      'tripId',
      'customerId',
      'amount',
      'currency',
      'paymentMethod',
      'paidAt',
    ],

    'payment.failed': [
      'paymentId',
      'fareId',
      'tripId',
      'customerId',
      'amount',
      'currency',
      'failureReason',
      'failedAt',
    ],

    'review.created': [
      'reviewId',
      'tripId',
      'customerId',
      'driverId',
      'score',
      'createdAt',
    ],
  });

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let channelPromise = null;

function assertNonEmptyString(
  value,
  fieldName,
) {
  if (
    typeof value !== 'string' ||
    value.trim() === ''
  ) {
    throw new TypeError(
      `${fieldName} must be a non-empty string`,
    );
  }
}

function validatePayload(
  eventType,
  payload,
) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new TypeError(
      'payload must be an object',
    );
  }

  const requiredFields =
    REQUIRED_PAYLOAD_FIELDS[eventType];

  for (const field of requiredFields) {
    if (
      !Object.prototype.hasOwnProperty.call(
        payload,
        field,
      )
    ) {
      throw new Error(
        `${eventType} payload is missing required field: ${field}`,
      );
    }
  }

  if (
    eventType ===
      'booking.no_driver_found' &&
    ![
      'NO_SUITABLE_DRIVER',
      'MATCHING_TIMEOUT',
    ].includes(payload.reason)
  ) {
    throw new Error(
      'booking.no_driver_found reason is invalid',
    );
  }

  if (
    eventType ===
    'trip.status.changed'
  ) {
    const statuses = [
      'ASSIGNED',
      'ARRIVED',
      'PICKED_UP',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELED',
    ];

    if (
      !statuses.includes(
        payload.toStatus,
      )
    ) {
      throw new Error(
        'trip.status.changed toStatus is invalid',
      );
    }

    if (
      payload.tripDistance !== null &&
      (
        typeof payload.tripDistance !==
          'number' ||
        payload.tripDistance < 0
      )
    ) {
      throw new Error(
        'trip.status.changed tripDistance must be null or >= 0',
      );
    }

    /*
     * Locked rule:
     * tripDistance must contain the final
     * value when Trip becomes COMPLETED.
     */
    if (
      payload.toStatus === 'COMPLETED' &&
      (
        typeof payload.tripDistance !==
          'number' ||
        payload.tripDistance < 0
      )
    ) {
      throw new Error(
        'trip.status.changed requires final tripDistance when COMPLETED',
      );
    }
  }

  if (
    eventType ===
      'payment.completed' &&
    ![
      'CASH',
      'ELECTRONIC',
    ].includes(payload.paymentMethod)
  ) {
    throw new Error(
      'payment.completed paymentMethod is invalid',
    );
  }

  if (
    eventType === 'review.created' &&
    (
      !Number.isInteger(
        payload.score,
      ) ||
      payload.score < 1 ||
      payload.score > 5
    )
  ) {
    throw new Error(
      'review.created score must be an integer from 1 to 5',
    );
  }
}

function validateEventEnvelope(
  event,
  expectedRoutingKey,
) {
  if (
    !event ||
    typeof event !== 'object' ||
    Array.isArray(event)
  ) {
    throw new TypeError(
      'event must be an object',
    );
  }

  const requiredEnvelopeFields = [
    'eventId',
    'eventType',
    'occurredAt',
    'producer',
    'correlationId',
    'schemaVersion',
    'payload',
  ];

  for (
    const field
    of requiredEnvelopeFields
  ) {
    if (
      !Object.prototype.hasOwnProperty.call(
        event,
        field,
      )
    ) {
      throw new Error(
        `Event envelope is missing required field: ${field}`,
      );
    }
  }

  assertNonEmptyString(
    event.eventId,
    'eventId',
  );

  if (
    !UUID_PATTERN.test(
      event.eventId,
    )
  ) {
    throw new Error(
      'eventId must be a UUID',
    );
  }

  assertNonEmptyString(
    event.eventType,
    'eventType',
  );

  assertNonEmptyString(
    event.occurredAt,
    'occurredAt',
  );

  assertNonEmptyString(
    event.producer,
    'producer',
  );

  assertNonEmptyString(
    event.correlationId,
    'correlationId',
  );

  const expectedProducer =
    EVENT_PRODUCERS[event.eventType];

  if (!expectedProducer) {
    throw new Error(
      `Unsupported eventType: ${event.eventType}`,
    );
  }

  if (
    event.producer !==
    expectedProducer
  ) {
    throw new Error(
      `Invalid producer for ${event.eventType}: expected ${expectedProducer}`,
    );
  }

  if (
    expectedRoutingKey !==
      undefined &&
    event.eventType !==
      expectedRoutingKey
  ) {
    throw new Error(
      `eventType ${event.eventType} does not match routing key ${expectedRoutingKey}`,
    );
  }

  if (
    !Number.isInteger(
      event.schemaVersion,
    ) ||
    event.schemaVersion < 1
  ) {
    throw new Error(
      'schemaVersion must be an integer >= 1',
    );
  }

  if (
    Number.isNaN(
      Date.parse(
        event.occurredAt,
      ),
    )
  ) {
    throw new Error(
      'occurredAt must be a valid ISO-8601 date-time',
    );
  }

  validatePayload(
    event.eventType,
    event.payload,
  );

  return event;
}

function createEventEnvelope({
  eventType,
  producer,
  correlationId,
  payload,
  eventId = randomUUID(),
  occurredAt =
    new Date().toISOString(),
  schemaVersion = 1,
}) {
  const event = {
    eventId,
    eventType,
    occurredAt,
    producer,
    correlationId,
    schemaVersion,
    payload,
  };

  return validateEventEnvelope(
    event,
    eventType,
  );
}

async function getPublisherChannel() {
  if (!channelPromise) {
    channelPromise = createChannel({
      confirm: true,
    })
      .then((channel) => {
        channel.on(
          'error',
          (error) => {
            logger.error(
              'RabbitMQ publisher channel error',
              { error },
            );
          },
        );

        channel.on(
          'close',
          () => {
            logger.warn(
              'RabbitMQ publisher channel closed',
            );

            channelPromise = null;
          },
        );

        return channel;
      })
      .catch((error) => {
        channelPromise = null;
        throw error;
      });
  }

  return channelPromise;
}

async function publishEvent(input) {
  const event =
    createEventEnvelope(input);

  const channel =
    await getPublisherChannel();

  const body = Buffer.from(
    JSON.stringify(event),
  );

  const accepted = channel.publish(
    EXCHANGE,
    event.eventType,
    body,
    {
      persistent: true,
      contentType:
        'application/json',
      contentEncoding: 'utf-8',

      messageId:
        event.eventId,

      type:
        event.eventType,

      correlationId:
        event.correlationId,

      timestamp:
        Math.floor(
          Date.now() / 1000,
        ),

      headers: {
        producer:
          event.producer,

        schemaVersion:
          event.schemaVersion,
      },
    },
  );

  if (!accepted) {
    await once(
      channel,
      'drain',
    );
  }

  await channel.waitForConfirms();

  logger.info(
    'RabbitMQ event published',
    {
      eventId:
        event.eventId,

      eventType:
        event.eventType,

      correlationId:
        event.correlationId,
    },
  );

  return event;
}

async function closePublisher() {
  if (!channelPromise) {
    return;
  }

  const current =
    channelPromise;

  channelPromise = null;

  try {
    const channel =
      await current;

    await channel.close();
  } catch (error) {
    logger.warn(
      'RabbitMQ publisher channel close failed',
      { error },
    );
  }
}

module.exports = {
  EVENT_PRODUCERS,
  REQUIRED_PAYLOAD_FIELDS,
  validatePayload,
  validateEventEnvelope,
  createEventEnvelope,
  publishEvent,
  closePublisher,
};