'use strict';

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const driverRepository =
  require(
    '../repositories/driver.repository'
  );

const vehicleRepository =
  require(
    '../repositories/vehicle.repository'
  );

const {
  toVehicle,
} = require(
  '../domain/vehicle'
);

const {
  VEHICLE_TYPE_STATUS,
  toVehicleType,
} = require(
  '../domain/vehicle-type'
);

function requireActor(context) {
  if (!context?.actorUserId) {
    throw AppError.unauthorized();
  }
}

function requirePermission(
  context,
  permission,
) {
  requireActor(context);

  const permissions =
    Array.isArray(context.permissions)
      ? context.permissions
      : [];

  if (!permissions.includes(permission)) {
    throw AppError.forbidden(
      'You do not have permission to perform this action',
      'FORBIDDEN',
    );
  }
}

function assertNumericId(
  value,
  fieldName,
) {
  if (!/^\d+$/.test(String(value || ''))) {
    throw AppError.badRequest(
      `${fieldName} is invalid`,
      'INVALID_REQUEST',
    );
  }

  return String(value);
}

async function ensureVehicleTypeActive(
  vehicleTypeId,
) {
  const vehicleType =
    await vehicleRepository
      .findVehicleTypeById(
        vehicleTypeId,
      );

  if (
    !vehicleType ||
    vehicleType.status !==
      VEHICLE_TYPE_STATUS.ACTIVE
  ) {
    throw AppError.badRequest(
      'Vehicle type does not exist or is inactive',
      'INVALID_VEHICLE_TYPE',
    );
  }
}

async function listVehicles(
  request,
) {
  requirePermission(
    request.context,
    'VEHICLE_MANAGE',
  );

  const rows =
    await vehicleRepository
      .listVehicles();

  return {
    items:
      rows.map(toVehicle),
  };
}

async function createVehicle(
  request,
) {
  requirePermission(
    request.context,
    'VEHICLE_MANAGE',
  );

  const driverId =
    assertNumericId(
      request.driverId,
      'driverId',
    );

  const vehicleTypeId =
    assertNumericId(
      request.vehicleTypeId,
      'vehicleTypeId',
    );

  const licensePlate =
    String(
      request.licensePlate || '',
    ).trim();

  if (!licensePlate) {
    throw AppError.badRequest(
      'licensePlate is required',
      'INVALID_REQUEST',
    );
  }

  const driver =
    await driverRepository
      .findByDriverId(driverId);

  if (!driver) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  await ensureVehicleTypeActive(
    vehicleTypeId,
  );

  try {
    const row =
      await vehicleRepository
        .createVehicle({
          driverId,
          vehicleTypeId,
          licensePlate,
          brand:
            request.brand || null,
          model:
            request.model || null,
        });

    return toVehicle(row);
  } catch (error) {
    if (error.code === '23505') {
      throw AppError.conflict(
        'License plate already exists',
        'LICENSE_PLATE_EXISTS',
      );
    }

    throw error;
  }
}

async function updateVehicle(
  request,
) {
  requirePermission(
    request.context,
    'VEHICLE_MANAGE',
  );

  const vehicleId =
    assertNumericId(
      request.vehicleId,
      'vehicleId',
    );

  const driverId =
    assertNumericId(
      request.driverId,
      'driverId',
    );

  const vehicleTypeId =
    assertNumericId(
      request.vehicleTypeId,
      'vehicleTypeId',
    );

  const licensePlate =
    String(
      request.licensePlate || '',
    ).trim();

  if (!licensePlate) {
    throw AppError.badRequest(
      'licensePlate is required',
      'INVALID_REQUEST',
    );
  }

  const driver =
    await driverRepository
      .findByDriverId(driverId);

  if (!driver) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  await ensureVehicleTypeActive(
    vehicleTypeId,
  );

  try {
    const row =
      await vehicleRepository
        .updateVehicle({
          vehicleId,
          driverId,
          vehicleTypeId,
          licensePlate,
          brand:
            request.brand || null,
          model:
            request.model || null,
        });

    if (!row) {
      throw AppError.notFound(
        'Vehicle does not exist',
        'VEHICLE_NOT_FOUND',
      );
    }

    return toVehicle(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error.code === '23505') {
      throw AppError.conflict(
        'License plate already exists',
        'LICENSE_PLATE_EXISTS',
      );
    }

    throw error;
  }
}

async function listVehicleTypes(
  request,
) {
  requireActor(
    request.context,
  );

  const rows =
    await vehicleRepository
      .listVehicleTypes();

  return {
    items:
      rows.map(toVehicleType),
  };
}

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicle,
  listVehicleTypes,
};