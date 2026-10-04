'use strict';
const service = require('../services/trip.service');
async function handleTripEvent(event, metadata = {}, operations = service) {
  if (event.eventType === 'driver.accepted') return operations.assigned(event.payload,metadata.properties?.correlationId);
  if (event.eventType === 'payment.completed') return operations.paymentCompleted(event.payload);
  throw new Error('Unsupported Trip consumer event');
}
module.exports = { handleTripEvent };
