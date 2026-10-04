'use strict';

const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { createLogger } = require('../logging/logger');
const { createChannel, EXCHANGE } = require('./connection');

const logger = createLogger(process.env.SERVICE_NAME || 'cab-system');

const EVENT_PRODUCERS = Object.freeze({
  'booking.created': 'booking-service',
  'offer.created': 'booking-service',
  'driver.accepted': 'booking-service',
  'driver.approval.changed': 'driver-service',
  'trip.status.changed': 'trip-service',
  'trip.canceled': 'trip-service',
  'trip.completed': 'trip-service',
  'payment.completed': 'payment-service',
});

const REQUIRED_PAYLOAD_FIELDS = Object.freeze({
  'booking.created': ['bookingId', 'customerId', 'customerUserId', 'createdAt'],
  'offer.created': ['offerId', 'bookingId', 'driverId', 'recipientUserIds', 'createdAt'],
  'driver.accepted': ['bookingId', 'customerId', 'driverId', 'vehicleId', 'customerUserId', 'driverUserId', 'acceptedAt'],
  'driver.approval.changed': ['driverId', 'userId', 'recipientUserIds', 'approvalStatus', 'changedAt'],
  'trip.status.changed': ['tripId', 'customerId', 'driverId', 'recipientUserIds', 'fromStatus', 'toStatus', 'changedAt'],
  'trip.canceled': ['tripId', 'customerId', 'driverId', 'recipientUserIds', 'reason', 'canceledAt'],
  'trip.completed': ['tripId', 'bookingId', 'customerId', 'driverId', 'customerUserId', 'driverUserId', 'completedAt'],
  'payment.completed': ['paymentId', 'bookingId', 'tripId', 'customerId', 'recipientUserIds', 'amount', 'paidAt'],
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRIP_STATUSES = new Set(['ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']);

let channelPromise = null;

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function validatePayload(eventType, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('payload must be an object');
  }

  const requiredFields = REQUIRED_PAYLOAD_FIELDS[eventType];
  if (!requiredFields) {
    throw new Error(`Unsupported eventType: ${eventType}`);
  }

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`${eventType} payload is missing required field: ${field}`);
    }
  }
  const { id } = require('../validation');
  for (const field of ['customerUserId','driverUserId']) {
    if (Object.hasOwn(payload, field)) {
      if (typeof payload[field] !== 'string') throw new TypeError('User reference must be a string');
      id(payload[field]);
    }
  }
  if (requiredFields.includes('recipientUserIds')) {
    if (!Array.isArray(payload.recipientUserIds) || payload.recipientUserIds.length === 0) {
      throw new TypeError('recipientUserIds must be a non-empty array of User IDs');
    }
    for (const recipient of payload.recipientUserIds) {
      if (typeof recipient !== 'string') throw new TypeError('Recipient ID must be a string');
      id(recipient);
    }
  }

  if (eventType === 'driver.approval.changed' && !['APPROVED', 'REJECTED'].includes(payload.approvalStatus)) {
    throw new Error('driver.approval.changed approvalStatus is invalid');
  }

  if (eventType === 'trip.status.changed') {
    if (payload.fromStatus !== null && !TRIP_STATUSES.has(payload.fromStatus)) {
      throw new Error('trip.status.changed fromStatus is invalid');
    }
    if (!TRIP_STATUSES.has(payload.toStatus)) {
      throw new Error('trip.status.changed toStatus is invalid');
    }
  }

  if (eventType === 'payment.completed') {
    if (typeof payload.amount !== 'number' || payload.amount < 0) {
      throw new Error('payment.completed amount must be a non-negative number');
    }
  }
}

function validateEventEnvelope(event, expectedRoutingKey) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('event must be an object');
  }

  for (const field of ['eventId', 'eventType', 'occurredAt', 'payload']) {
    if (!Object.prototype.hasOwnProperty.call(event, field)) {
      throw new Error(`Event envelope is missing required field: ${field}`);
    }
  }

  assertNonEmptyString(event.eventId, 'eventId');
  assertNonEmptyString(event.eventType, 'eventType');
  assertNonEmptyString(event.occurredAt, 'occurredAt');

  if (!UUID_PATTERN.test(event.eventId)) {
    throw new Error('eventId must be a UUID');
  }
  if (!EVENT_PRODUCERS[event.eventType]) {
    throw new Error(`Unsupported eventType: ${event.eventType}`);
  }
  if (expectedRoutingKey !== undefined && event.eventType !== expectedRoutingKey) {
    throw new Error(`eventType ${event.eventType} does not match routing key ${expectedRoutingKey}`);
  }
  if (Number.isNaN(Date.parse(event.occurredAt))) {
    throw new Error('occurredAt must be a valid ISO-8601 date-time');
  }

  validatePayload(event.eventType, event.payload);
  return event;
}

function createEventEnvelope({
  eventType,
  payload,
  eventId = randomUUID(),
  occurredAt = new Date().toISOString(),
}) {
  return validateEventEnvelope({ eventId, eventType, occurredAt, payload }, eventType);
}

async function getPublisherChannel() {
  if (!channelPromise) {
    channelPromise = createChannel({ confirm: true })
      .then((channel) => {
        channel.on('error', (error) => logger.error('RabbitMQ publisher channel error', { error }));
        channel.on('close', () => {
          logger.warn('RabbitMQ publisher channel closed');
          channelPromise = null;
        });
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
  const event = createEventEnvelope(input);
  const expectedProducer = EVENT_PRODUCERS[event.eventType];
  const producer = input.producer || process.env.SERVICE_NAME || expectedProducer;

  if (producer !== expectedProducer) {
    throw new Error(`Invalid producer for ${event.eventType}: expected ${expectedProducer}`);
  }

  const channel = await getPublisherChannel();
  const body = Buffer.from(JSON.stringify(event));
  const correlationId = input.correlationId || undefined;

  const accepted = channel.publish(EXCHANGE, event.eventType, body, {
    persistent: true,
    contentType: 'application/json',
    contentEncoding: 'utf-8',
    messageId: event.eventId,
    type: event.eventType,
    correlationId,
    timestamp: Math.floor(Date.now() / 1000),
    headers: { producer },
  });

  if (!accepted) {
    await once(channel, 'drain');
  }
  await channel.waitForConfirms();

  logger.info('RabbitMQ event published', {
    eventId: event.eventId,
    eventType: event.eventType,
    correlationId,
  });

  return event;
}

async function closePublisher() {
  if (!channelPromise) return;
  const current = channelPromise;
  channelPromise = null;
  try {
    const channel = await current;
    await channel.close();
  } catch (error) {
    logger.warn('RabbitMQ publisher channel close failed', { error });
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
