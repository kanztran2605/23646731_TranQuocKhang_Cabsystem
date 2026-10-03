'use strict';

const VEHICLE_TYPE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
});

function toVehicleType(row) {
  return {
    vehicleTypeId:
      String(row.vehicle_type_id),

    name:
      row.name,

    ...(row.description
      ? { description: row.description }
      : {}),

    status:
      row.status,
  };
}

module.exports = {
  VEHICLE_TYPE_STATUS,
  toVehicleType,
};