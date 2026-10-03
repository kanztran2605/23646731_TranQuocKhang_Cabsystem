'use strict';

const {
  pool,
} = require(
  '../config/database'
);

async function upsertLocation({
  driverId,
  latitude,
  longitude,
}) {
  const result =
    await pool.query(
      `INSERT INTO driver_location
         (
           driver_id,
           latitude,
           longitude,
           recorded_at
         )
       VALUES
         (
           $1::bigint,
           $2,
           $3,
           CURRENT_TIMESTAMP
         )
       ON CONFLICT (driver_id)
       DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         recorded_at = CURRENT_TIMESTAMP
       RETURNING
         driver_id,
         latitude,
         longitude,
         recorded_at`,
      [
        driverId,
        latitude,
        longitude,
      ],
    );

  return result.rows[0];
}

async function findByDriverId(
  driverId,
) {
  const result =
    await pool.query(
      `SELECT
         driver_id,
         latitude,
         longitude,
         recorded_at
       FROM driver_location
       WHERE driver_id = $1::bigint
       LIMIT 1`,
      [driverId],
    );

  return result.rows[0] || null;
}

async function findNearby({
  latitude,
  longitude,
  radiusKm,
  page,
  limit,
  vehicleTypeId = null,
}) {
  const offset =
    (page - 1) * limit;

  const commonParams = [
    latitude,
    longitude,
    radiusKm,
    vehicleTypeId,
  ];

  const countResult =
    await pool.query(
      `SELECT COUNT(*)::bigint AS total
       FROM driver d
       JOIN driver_profile dp
         ON dp.driver_id = d.driver_id
       JOIN driver_location dl
         ON dl.driver_id = d.driver_id
       JOIN LATERAL (
         SELECT
           vehicle_id,
           vehicle_type_id,
           license_plate,
           brand,
           model,
           status
         FROM vehicle
         WHERE driver_id = d.driver_id
           AND status = 'ACTIVE'
           AND (
             $4::bigint IS NULL
             OR vehicle_type_id = $4::bigint
           )
         ORDER BY vehicle_id
         LIMIT 1
       ) v ON TRUE
       WHERE d.approval_status = 'APPROVED'
         AND d.availability_status = 'AVAILABLE'
         AND ST_DWithin(
           ST_SetSRID(
             ST_MakePoint(
               dl.longitude::double precision,
               dl.latitude::double precision
             ),
             4326
           )::geography,
           ST_SetSRID(
             ST_MakePoint(
               $2::double precision,
               $1::double precision
             ),
             4326
           )::geography,
           $3::double precision * 1000
         )`,
      commonParams,
    );

  const itemsResult =
    await pool.query(
      `SELECT
         d.driver_id,
         d.user_id,
         d.approval_status,
         d.availability_status,
         dp.full_name,
         dl.latitude,
         dl.longitude,
         dl.recorded_at,
         v.vehicle_id,
         v.vehicle_type_id,
         v.license_plate,
         v.brand,
         v.model,
         ST_Distance(
           ST_SetSRID(
             ST_MakePoint(
               dl.longitude::double precision,
               dl.latitude::double precision
             ),
             4326
           )::geography,
           ST_SetSRID(
             ST_MakePoint(
               $2::double precision,
               $1::double precision
             ),
             4326
           )::geography
         ) / 1000.0 AS distance_km
       FROM driver d
       JOIN driver_profile dp
         ON dp.driver_id = d.driver_id
       JOIN driver_location dl
         ON dl.driver_id = d.driver_id
       JOIN LATERAL (
         SELECT
           vehicle_id,
           vehicle_type_id,
           license_plate,
           brand,
           model,
           status
         FROM vehicle
         WHERE driver_id = d.driver_id
           AND status = 'ACTIVE'
           AND (
             $4::bigint IS NULL
             OR vehicle_type_id = $4::bigint
           )
         ORDER BY vehicle_id
         LIMIT 1
       ) v ON TRUE
       WHERE d.approval_status = 'APPROVED'
         AND d.availability_status = 'AVAILABLE'
         AND ST_DWithin(
           ST_SetSRID(
             ST_MakePoint(
               dl.longitude::double precision,
               dl.latitude::double precision
             ),
             4326
           )::geography,
           ST_SetSRID(
             ST_MakePoint(
               $2::double precision,
               $1::double precision
             ),
             4326
           )::geography,
           $3::double precision * 1000
         )
       ORDER BY
         distance_km,
         d.driver_id
       LIMIT $5
       OFFSET $6`,
      [
        ...commonParams,
        limit,
        offset,
      ],
    );

  return {
    total:
      Number(
        countResult.rows[0].total,
      ),
    rows:
      itemsResult.rows,
  };
}

module.exports = {
  upsertLocation,
  findByDriverId,
  findNearby,
};