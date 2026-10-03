'use strict';

const driverService =
  require(
    '../services/driver.service'
  );

async function handleTripStatusChanged(
  event,
) {
  const {
    driverId,
    toStatus,
  } = event.payload;

  if (toStatus === 'ASSIGNED') {
    await driverService
      .markBusyFromAssignment(
        driverId,
      );

    return;
  }

  if (
    toStatus === 'COMPLETED' ||
    toStatus === 'CANCELED'
  ) {
    await driverService
      .releaseAfterTrip(
        driverId,
      );
  }
}

async function handleTripCanceled(
  event,
) {
  await driverService
    .releaseAfterTrip(
      event.payload.driverId,
    );
}

module.exports = {
  handleTripStatusChanged,
  handleTripCanceled,
};