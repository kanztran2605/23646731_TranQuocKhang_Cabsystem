'use strict';

function toVehicle(row) {
  return {
    vehicleId:
      String(row.vehicle_id),

    driverId:
      String(row.driver_id),

    vehicleTypeId:
      String(row.vehicle_type_id),

    status:
      row.status,

    licensePlate:
      row.license_plate,

    ...(row.brand
      ? { brand: row.brand }
      : {}),

    ...(row.model
      ? { model: row.model }
      : {}),
  };
}

function toVehicleSummary(row) {
  if (!row.vehicle_id) {
    return undefined;
  }

  return {
    vehicleTypeId:
      String(row.vehicle_type_id),

    ...(row.brand
      ? { brand: row.brand }
      : {}),

    ...(row.model
      ? { model: row.model }
      : {}),

    licensePlate:
      row.license_plate,
  };
}

module.exports = {
  toVehicle,
  toVehicleSummary,
};