'use strict';
const { publishEvent } = require('../../../../shared/rabbitmq/publisher');
const { eventId } = require('../../../../shared/rabbitmq/event-id');
function createTripPublisher(publish = publishEvent) {
  return async function publishTrip(eventType, row, fromStatus, correlationId) {
    const base = { tripId: String(row.tid), customerId: String(row.cid), driverId: String(row.did) };
    let payload, at;
    if (eventType === 'trip.status.changed') {
      at = new Date(row.u_at).toISOString();
      payload = { ...base, fromStatus, toStatus: row.s, changedAt: at, recipientUserIds: [String(row.customer_uid)] };
    } else if (eventType === 'trip.canceled') {
      at = new Date(row.can_at).toISOString();
      payload = { ...base, reason: row.r, canceledAt: at, recipientUserIds: [...new Set([String(row.customer_uid),String(row.driver_uid)])] };
    } else if (eventType === 'trip.completed') {
      at = new Date(row.done_at).toISOString();
      payload = { ...base, bookingId: String(row.bid), completedAt: at,
        customerUserId: String(row.customer_uid), driverUserId: String(row.driver_uid) };
    } else throw new Error('Unsupported Trip event');
    return publish({ producer: 'trip-service', eventType, eventId: eventId(eventType + ':' + row.tid + ':' + row.s),
      occurredAt: at, correlationId, payload });
  };
}
module.exports = { publishTrip: createTripPublisher(), createTripPublisher };
