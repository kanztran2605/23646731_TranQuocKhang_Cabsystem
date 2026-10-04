'use strict';
const driverService = require('../services/driver.service');
function createTripEventHandler(service = driverService) {
  return async (event) => {
    if (event.eventType === 'trip.completed') await service.releaseAfterTrip(event.payload.driverId,event.payload.completedAt);
    else if (event.eventType === 'trip.canceled') await service.releaseAfterTrip(event.payload.driverId,event.payload.canceledAt);
    else throw new Error('Unsupported Driver consumer event');
  };
}
module.exports = { handleTripEvent: createTripEventHandler(),createTripEventHandler };
