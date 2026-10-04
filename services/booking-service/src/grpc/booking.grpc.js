'use strict';
const { handlers, health } = require('../../../../shared/grpc/handlers');
const service = require('../services/booking.service');
function createBookingGrpcHandlers(implementation = service) {
  return handlers(implementation, ['createBooking','getBooking','listMyBookings','listMyOffers','acceptOffer']);
}
function createBookingHealthHandlers(check) { return health(check); }
module.exports = { createBookingGrpcHandlers, createBookingHealthHandlers };
