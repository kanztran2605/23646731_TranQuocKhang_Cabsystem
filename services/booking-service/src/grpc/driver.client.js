'use strict';

const {
  grpc,
  createClient,
} = require(
  '../../../../shared/grpc/loader'
);

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

let client = null;

function getClient() {
  if (!client) {
    client =
      createClient({
        protoFile:
          'driver.proto',

        packageName:
          'cab.driver.v1',

        serviceName:
          'DriverService',

        address:
          `${
            process.env
              .DRIVER_SERVICE_HOST ||
            'driver-service'
          }:${
            process.env
              .DRIVER_GRPC_PORT ||
            50053
          }`,
      });
  }

  return client;
}

function callUnary(
  methodName,
  request,
  timeoutMs = 5000,
) {
  const current =
    getClient();

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      current[
        methodName
      ](
        request,

        new grpc.Metadata(),

        {
          deadline:
            new Date(
              Date.now() +
              timeoutMs,
            ),
        },

        (
          error,
          response,
        ) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(response);
        },
      );
    },
  );
}

function mapGrpcError(error) {
  switch (error.code) {
    case grpc.status
      .NOT_FOUND:
      return AppError.notFound(
        error.details ||
          'Driver resource does not exist',
        'DRIVER_NOT_FOUND',
      );

    case grpc.status
      .INVALID_ARGUMENT:
      return AppError.badRequest(
        error.details ||
          'Invalid Driver request',
        'INVALID_REQUEST',
      );

    case grpc.status
      .UNAUTHENTICATED:
      return AppError.unauthorized(
        error.details ||
          'Unauthorized',
        'UNAUTHORIZED',
      );

    case grpc.status
      .PERMISSION_DENIED:
      return AppError.forbidden(
        error.details ||
          'Forbidden',
        'FORBIDDEN',
      );

    case grpc.status
      .FAILED_PRECONDITION:

    case grpc.status
      .ALREADY_EXISTS:
      return AppError.conflict(
        error.details ||
          'Driver state conflict',
        'DRIVER_STATE_CONFLICT',
      );

    case grpc.status
      .UNAVAILABLE:

    case grpc.status
      .DEADLINE_EXCEEDED:
      return new AppError(
        'Driver service is unavailable',
        {
          code:
            'DRIVER_SERVICE_UNAVAILABLE',

          statusCode: 503,
        },
      );

    default:
      return AppError.internal(
        'Driver service request failed',
        'DRIVER_SERVICE_ERROR',
        error,
      );
  }
}

async function safeCall(
  methodName,
  request,
) {
  try {
    return await callUnary(
      methodName,
      request,
    );
  } catch (error) {
    throw mapGrpcError(
      error,
    );
  }
}

async function findEligibleDrivers({
  pickupLatitude,
  pickupLongitude,
  radiusKm,
  vehicleTypeId,
  page,
  limit,
  correlationId,
}) {
  return safeCall(
    'findEligibleDrivers',

    {
      pickupLatitude,
      pickupLongitude,
      radiusKm,

      vehicleTypeId:
        String(
          vehicleTypeId,
        ),

      page,
      limit,
      correlationId,
    },
  );
}

async function getMyDriverProfile(
  context,
) {
  return safeCall(
    'getMyDriverProfile',
    { context },
  );
}

async function getDriverByUserId(
  userId,
  correlationId,
) {
  return safeCall(
    'getDriverByUserId',

    {
      userId:
        String(userId),

      correlationId,
    },
  );
}

async function getDriverById(
  context,
  driverId,
) {
  return safeCall(
    'getDriverById',

    {
      context,

      driverId:
        String(driverId),
    },
  );
}

async function listVehicleTypes(
  context,
) {
  return safeCall(
    'listVehicleTypes',
    { context },
  );
}

function closeDriverClient() {
  if (client) {
    client.close();
    client = null;
  }
}

module.exports = {
  findEligibleDrivers,
  getMyDriverProfile,
  getDriverByUserId,
  getDriverById,
  listVehicleTypes,
  closeDriverClient,
};