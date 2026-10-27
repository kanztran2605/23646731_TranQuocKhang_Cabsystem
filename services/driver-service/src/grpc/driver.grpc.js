'use strict';
const { handlers } = require('../../../../shared/grpc/handlers');
const service = require('../services/driver.service');
function createDriverGrpcHandlers(implementation = service) {
  return handlers(implementation,['requestOtp','prepareDriverRegistration','registerDriver','getDriver','getDriverByUserId','getAssignedDriver','listPendingDrivers',
    'reviewDriverApproval','setAvailability','updateLocation','getNearbyDrivers','findEligibleDrivers',
    'markBusyForAssignment','getDriverLocation','listVehicleTypes']);
}
module.exports = { createDriverGrpcHandlers };
