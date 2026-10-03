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

const locationRepository =
  require(
    '../repositories/location.repository'
  );

const {
  APPROVAL_STATUS,
  AVAILABILITY_STATUS,
} = require(
  '../domain/driver'
);

const {
  assertCoordinates,
  toDriverLocation,
} = require(
  '../domain/driver-location'
);

const {
  toVehicleSummary,
} = require(
  '../domain/vehicle'
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

function validateSearch({
  latitude,
  longitude,
  radiusKm,
  page,
  limit,
}) {
  try {
    assertCoordinates(
      latitude,
      longitude,
    );
  } catch (_error) {
    throw AppError.badRequest(
      'Invalid latitude or longitude',
      'INVALID_LOCATION',
    );
  }

  if (
    !Number.isFinite(radiusKm) ||
    radiusKm < 0.1 ||
    radiusKm > 50 ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw AppError.badRequest(
      'Invalid Nearby Driver query',
      'INVALID_REQUEST',
    );
  }
}

function nearbyItem(row) {
  return {
    driverId:
      String(row.driver_id),
    fullName:
      row.full_name,
    availabilityStatus:
      row.availability_status,
    vehicle:
      toVehicleSummary(row),
    latitude:
      Number(row.latitude),
    longitude:
      Number(row.longitude),
    distanceKm:
      Number(
        Number(
          row.distance_km,
        ).toFixed(3),
      ),
  };
}

async function updateMyLocation(
  request,
) {
  requireActor(
    request.context,
  );

  if (
    request.context.actorRole !==
    'DRIVER'
  ) {
    throw AppError.forbidden(
      'Only Driver can update Driver location',
      'FORBIDDEN',
    );
  }

  requirePermission(
    request.context,
    'DRIVER_LOCATION_UPDATE_SELF',
  );

  const latitude =
    Number(request.latitude);
  const longitude =
    Number(request.longitude);

  try {
    assertCoordinates(
      latitude,
      longitude,
    );
  } catch (_error) {
    throw AppError.badRequest(
      'Invalid latitude or longitude',
      'INVALID_LOCATION',
    );
  }

  const driver =
    await driverRepository
      .findByUserId(
        request.context
          .actorUserId,
      );

  if (!driver) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  if (
    driver.approval_status !==
      APPROVAL_STATUS.APPROVED ||
    ![
      AVAILABILITY_STATUS.AVAILABLE,
      AVAILABILITY_STATUS.BUSY,
    ].includes(
      driver.availability_status,
    )
  ) {
    throw AppError.forbidden(
      'Driver location can be updated only when Driver is AVAILABLE or BUSY',
      'DRIVER_LOCATION_NOT_ALLOWED',
    );
  }

  const row =
    await locationRepository
      .upsertLocation({
        driverId:
          driver.driver_id,
        latitude,
        longitude,
      });

  return toDriverLocation(row);
}

async function getNearbyDrivers(
  request,
) {
  requirePermission(
    request.context,
    'DRIVER_MANAGE',
  );

  const latitude =
    Number(request.latitude);
  const longitude =
    Number(request.longitude);
  const radiusKm =
    Number(request.radiusKm || 1);
  const page =
    Number(request.page || 1);
  const limit =
    Number(request.limit || 5);

  validateSearch({
    latitude,
    longitude,
    radiusKm,
    page,
    limit,
  });

  const result =
    await locationRepository
      .findNearby({
        latitude,
        longitude,
        radiusKm,
        page,
        limit,
      });

  return {
    page,
    limit,
    total: result.total,
    items:
      result.rows.map(
        nearbyItem,
      ),
  };
}

async function findEligibleDrivers(
  request,
) {
  const latitude =
    Number(
      request.pickupLatitude,
    );
  const longitude =
    Number(
      request.pickupLongitude,
    );
  const radiusKm =
    Number(request.radiusKm || 1);
  const page =
    Number(request.page || 1);
  const limit =
    Number(request.limit || 20);
  const vehicleTypeId =
    assertNumericId(
      request.vehicleTypeId,
      'vehicleTypeId',
    );

  validateSearch({
    latitude,
    longitude,
    radiusKm,
    page,
    limit,
  });

  const result =
    await locationRepository
      .findNearby({
        latitude,
        longitude,
        radiusKm,
        page,
        limit,
        vehicleTypeId,
      });

  return {
    items:
      result.rows.map(
        (row) => ({
          driverId:
            String(row.driver_id),
          vehicleId:
            String(row.vehicle_id),
          vehicleTypeId:
            String(
              row.vehicle_type_id,
            ),
          latitude:
            Number(row.latitude),
          longitude:
            Number(row.longitude),
          distanceKm:
            Number(
              Number(
                row.distance_km,
              ).toFixed(3),
            ),
        }),
      ),
  };
}

async function getDriverLocation(
  request,
) {
  const driverId =
    assertNumericId(
      request.driverId,
      'driverId',
    );

  const row =
    await locationRepository
      .findByDriverId(
        driverId,
      );

  if (!row) {
    throw AppError.notFound(
      'Driver location does not exist',
      'DRIVER_LOCATION_NOT_FOUND',
    );
  }

  return toDriverLocation(row);
}

module.exports = {
  updateMyLocation,
  getNearbyDrivers,
  findEligibleDrivers,
  getDriverLocation,
};