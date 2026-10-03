'use strict';

const {
  pool,
} = require(
  '../config/database'
);

function runner(client) {
  return client || pool;
}

async function findVehicleTypeById(
  vehicleTypeId,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         vehicle_type_id,
         name,
         description,
         status
       FROM vehicle_type
       WHERE vehicle_type_id = $1::bigint
       LIMIT 1`,
      [vehicleTypeId],
    );

  return result.rows[0] || null;
}

async function listVehicleTypes() {
  const result =
    await pool.query(
      `SELECT
         vehicle_type_id,
         name,
         description,
         status
       FROM vehicle_type
       ORDER BY vehicle_type_id`,
    );

  return result.rows;
}

async function listVehicles() {
  const result =
    await pool.query(
      `SELECT
         vehicle_id,
         driver_id,
         vehicle_type_id,
         license_plate,
         brand,
         model,
         status
       FROM vehicle
       ORDER BY vehicle_id`,
    );

  return result.rows;
}

async function findActiveByDriverId(
  driverId,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         vehicle_id,
         driver_id,
         vehicle_type_id,
         license_plate,
         brand,
         model,
         status
       FROM vehicle
       WHERE driver_id = $1::bigint
         AND status = 'ACTIVE'
       ORDER BY vehicle_id
       LIMIT 1`,
      [driverId],
    );

  return result.rows[0] || null;
}

async function createVehicle(
  {
    driverId,
    vehicleTypeId,
    licensePlate,
    brand,
    model,
    status = 'ACTIVE',
  },
  client,
) {
  const result =
    await runner(client).query(
      `INSERT INTO vehicle
         (
           driver_id,
           vehicle_type_id,
           license_plate,
           brand,
           model,
           status
         )
       VALUES
         (
           $1::bigint,
           $2::bigint,
           $3,
           $4,
           $5,
           $6
         )
       RETURNING
         vehicle_id,
         driver_id,
         vehicle_type_id,
         license_plate,
         brand,
         model,
         status`,
      [
        driverId,
        vehicleTypeId,
        licensePlate,
        brand || null,
        model || null,
        status,
      ],
    );

  return result.rows[0];
}

async function updateVehicle(
  {
    vehicleId,
    driverId,
    vehicleTypeId,
    licensePlate,
    brand,
    model,
  },
) {
  const result =
    await pool.query(
      `UPDATE vehicle
       SET
         driver_id = $1::bigint,
         vehicle_type_id = $2::bigint,
         license_plate = $3,
         brand = $4,
         model = $5
       WHERE vehicle_id = $6::bigint
       RETURNING
         vehicle_id,
         driver_id,
         vehicle_type_id,
         license_plate,
         brand,
         model,
         status`,
      [
        driverId,
        vehicleTypeId,
        licensePlate,
        brand || null,
        model || null,
        vehicleId,
      ],
    );

  return result.rows[0] || null;
}

async function findById(
  vehicleId,
) {
  const result =
    await pool.query(
      `SELECT
         vehicle_id,
         driver_id,
         vehicle_type_id,
         license_plate,
         brand,
         model,
         status
       FROM vehicle
       WHERE vehicle_id = $1::bigint
       LIMIT 1`,
      [vehicleId],
    );

  return result.rows[0] || null;
}

module.exports = {
  findVehicleTypeById,
  listVehicleTypes,
  listVehicles,
  findActiveByDriverId,
  createVehicle,
  updateVehicle,
  findById,
};