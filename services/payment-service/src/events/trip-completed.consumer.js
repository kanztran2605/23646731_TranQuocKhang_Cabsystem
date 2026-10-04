'use strict';
const service = require('../services/payment.service');
async function handlePaymentEvent(event, _metadata, operations = service) {
  if (event.eventType === 'booking.created') return operations.bookingCreated(event.payload);
  if (event.eventType === 'trip.completed') return operations.tripCompleted(event.payload);
  throw new Error('Unsupported Payment consumer event');
}
module.exports = { handlePaymentEvent };
