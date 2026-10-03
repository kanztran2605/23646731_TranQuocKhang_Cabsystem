'use strict';

const {
  grpc,
} = require(
  '../../../../shared/grpc/loader'
);

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const driverService =
  require(
    '../services/driver.service'
  );

const nearbyDriverService =
  require(
    '../services/nearby-driver.service'
  );

const vehicleService =
  require(
    '../services/vehicle.service'
  );

function toGrpcError(error) {
  if (error instanceof AppError) {
    const statusMap = {
      400:
        grpc.status.INVALID_ARGUMENT,
      401:
        grpc.status.UNAUTHENTICATED,
      403:
        grpc.status.PERMISSION_DENIED,
      404:
        grpc.status.NOT_FOUND,
      409:
        grpc.status.FAILED_PRECONDITION,
      429:
        grpc.status.RESOURCE_EXHAUSTED,
    };

    return {
      code:
        statusMap[
          error.statusCode
        ] || grpc.status.INTERNAL,
      details:
        error.message,
    };
  }

  return {
    code:
      grpc.status.INTERNAL,
    details:
      'Internal server error',
  };
}

function unary(handler) {
  return async (
    call,
    callback,
  ) => {
    try {
      callback(
        null,
        await handler(
          call.request,
        ),
      );
    } catch (error) {
      callback(
        toGrpcError(error),
      );
    }
  };
}

function createDriverGrpcHandlers() {
  return {
    registerDriverProfile:
      unary(
        driverService
          .registerDriverProfile,
      ),

    getMyDriverProfile:
      unary(
        driverService
          .getMyDriverProfile,
      ),

    updateMyDriverProfile:
      unary(
        driverService
          .updateMyDriverProfile,
      ),

    getDriverById:
      unary(
        driverService
          .getDriverById,
      ),

    updateDriver:
      unary(
        driverService
          .updateDriver,
      ),

    getNearbyDrivers:
      unary(
        nearbyDriverService
          .getNearbyDrivers,
      ),

    listDrivers:
      unary(
        driverService
          .listDrivers,
      ),

    updateMyAvailability:
      unary(
        driverService
          .updateMyAvailability,
      ),

    updateMyLocation:
      unary(
        nearbyDriverService
          .updateMyLocation,
      ),

    getPendingDriverApplications:
      unary(
        driverService
          .getPendingDriverApplications,
      ),

    approveOrRejectDriver:
      unary(
        driverService
          .approveOrRejectDriver,
      ),

    listVehicles:
      unary(
        vehicleService
          .listVehicles,
      ),

    createVehicle:
      unary(
        vehicleService
          .createVehicle,
      ),

    updateVehicle:
      unary(
        vehicleService
          .updateVehicle,
      ),

    listVehicleTypes:
      unary(
        vehicleService
          .listVehicleTypes,
      ),

    getDriverByUserId:
      unary(
        driverService
          .getDriverByUserId,
      ),

    findEligibleDrivers:
      unary(
        nearbyDriverService
          .findEligibleDrivers,
      ),

    getDriverLocation:
      unary(
        nearbyDriverService
          .getDriverLocation,
      ),
  };
}

module.exports = {
  createDriverGrpcHandlers,
};