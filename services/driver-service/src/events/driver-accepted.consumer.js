'use strict';

const driverService =
  require(
    '../services/driver.service'
  );

async function handleDriverAccepted(
  event,
) {
  await driverService
    .markBusyFromAssignment(
      event.payload.driverId,
    );
}

module.exports = {
  handleDriverAccepted,
};