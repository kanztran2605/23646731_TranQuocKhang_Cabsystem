'use strict';
const service = require('../services/trip.service');
const { handlers } = require('../../../../shared/grpc/handlers');
function createTripGrpcHandlers(operations = service) {
  return handlers(operations,['getTrip','getTripByBooking','updateTripStatus','updateTripLocation','cancelTrip','getTripStatusHistory','validateCompletedTrip']);
}
module.exports = { createTripGrpcHandlers };
