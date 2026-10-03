'use strict';

function assertCoordinates(
  latitude,
  longitude,
) {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError(
      'Invalid latitude or longitude',
    );
  }
}

function toDriverLocation(row) {
  return {
    driverId:
      String(row.driver_id),

    latitude:
      Number(row.latitude),

    longitude:
      Number(row.longitude),

    ...(row.recorded_at
      ? {
          recordedAt:
            new Date(
              row.recorded_at,
            ).toISOString(),
        }
      : {}),
  };
}

module.exports = {
  assertCoordinates,
  toDriverLocation,
};