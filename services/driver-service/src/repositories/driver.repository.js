'use strict';

const {
  pool,
} = require(
  '../config/database'
);

function runner(client) {
  return client || pool;
}

async function findByUserId(
  userId,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         d.driver_id,
         d.user_id,
         d.approval_status,
         d.availability_status,
         d.created_at,
         dp.full_name,
         dp.address,
         dp.date_of_birth,
         dp.driver_license_ciphertext,
         dp.encryption_key_version
       FROM driver d
       JOIN driver_profile dp
         ON dp.driver_id = d.driver_id
       WHERE d.user_id = $1::bigint
       LIMIT 1`,
      [userId],
    );

  return result.rows[0] || null;
}

async function findByDriverId(
  driverId,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         d.driver_id,
         d.user_id,
         d.approval_status,
         d.availability_status,
         d.created_at,
         dp.full_name,
         dp.address,
         dp.date_of_birth,
         dp.driver_license_ciphertext,
         dp.encryption_key_version
       FROM driver d
       JOIN driver_profile dp
         ON dp.driver_id = d.driver_id
       WHERE d.driver_id = $1::bigint
       LIMIT 1`,
      [driverId],
    );

  return result.rows[0] || null;
}

async function lockByDriverId(
  driverId,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         driver_id,
         user_id,
         approval_status,
         availability_status
       FROM driver
       WHERE driver_id = $1::bigint
       FOR UPDATE`,
      [driverId],
    );

  return result.rows[0] || null;
}

async function createDriver(
  {
    userId,
    approvalStatus,
    availabilityStatus,
  },
  client,
) {
  const result =
    await runner(client).query(
      `INSERT INTO driver
         (
           user_id,
           approval_status,
           availability_status
         )
       VALUES
         ($1::bigint, $2, $3)
       RETURNING
         driver_id,
         user_id,
         approval_status,
         availability_status,
         created_at`,
      [
        userId,
        approvalStatus,
        availabilityStatus,
      ],
    );

  return result.rows[0];
}

async function createProfile(
  {
    driverId,
    fullName,
    driverLicenseCiphertext,
    encryptionKeyVersion,
  },
  client,
) {
  await runner(client).query(
    `INSERT INTO driver_profile
       (
         driver_id,
         full_name,
         driver_license_ciphertext,
         encryption_key_version
       )
     VALUES
       ($1::bigint, $2, $3, $4)`,
    [
      driverId,
      fullName,
      driverLicenseCiphertext,
      encryptionKeyVersion,
    ],
  );
}

async function updateProfile(
  driverId,
  patch,
  client,
) {
  const fields = [];
  const values = [];

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'fullName',
    )
  ) {
    values.push(patch.fullName);
    fields.push(
      `full_name = $${values.length}`,
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'address',
    )
  ) {
    values.push(patch.address);
    fields.push(
      `address = $${values.length}`,
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'dateOfBirth',
    )
  ) {
    values.push(patch.dateOfBirth);
    fields.push(
      `date_of_birth = $${values.length}::date`,
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'driverLicenseCiphertext',
    )
  ) {
    values.push(
      patch.driverLicenseCiphertext,
    );
    fields.push(
      `driver_license_ciphertext = $${values.length}`,
    );

    values.push(
      patch.encryptionKeyVersion,
    );
    fields.push(
      `encryption_key_version = $${values.length}`,
    );
  }

  if (fields.length === 0) {
    return findByDriverId(
      driverId,
      client,
    );
  }

  values.push(driverId);

  await runner(client).query(
    `UPDATE driver_profile
     SET ${fields.join(', ')}
     WHERE driver_id = $${values.length}::bigint`,
    values,
  );

  return findByDriverId(
    driverId,
    client,
  );
}

async function createApplication(
  {
    driverId,
    vehicleId,
    status,
  },
  client,
) {
  const result =
    await runner(client).query(
      `INSERT INTO driver_application
         (
           driver_id,
           vehicle_id,
           status
         )
       VALUES
         ($1::bigint, $2::bigint, $3)
       RETURNING
         application_id,
         driver_id,
         vehicle_id,
         status,
         submitted_at`,
      [
        driverId,
        vehicleId,
        status,
      ],
    );

  return result.rows[0];
}

async function listDrivers({
  approvalStatus,
  availabilityStatus,
  vehicleTypeId,
  page,
  limit,
}) {
  const where = [];
  const values = [];

  if (approvalStatus) {
    values.push(approvalStatus);
    where.push(
      `d.approval_status = $${values.length}`,
    );
  }

  if (availabilityStatus) {
    values.push(availabilityStatus);
    where.push(
      `d.availability_status = $${values.length}`,
    );
  }

  if (vehicleTypeId) {
    values.push(vehicleTypeId);
    where.push(
      `EXISTS (
         SELECT 1
         FROM vehicle v
         WHERE v.driver_id = d.driver_id
           AND v.vehicle_type_id = $${values.length}::bigint
       )`,
    );
  }

  const whereSql =
    where.length > 0
      ? `WHERE ${where.join(' AND ')}`
      : '';

  values.push(limit);
  const limitIndex = values.length;

  values.push(
    (page - 1) * limit,
  );
  const offsetIndex = values.length;

  const result =
    await pool.query(
      `SELECT
         d.driver_id,
         d.user_id,
         d.approval_status,
         d.availability_status,
         d.created_at,
         dp.full_name,
         dp.address,
         dp.date_of_birth,
         dp.driver_license_ciphertext,
         dp.encryption_key_version
       FROM driver d
       JOIN driver_profile dp
         ON dp.driver_id = d.driver_id
       ${whereSql}
       ORDER BY d.driver_id
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

  return result.rows;
}

async function listPendingApplications({
  page,
  limit,
}) {
  const offset =
    (page - 1) * limit;

  const countResult =
    await pool.query(
      `SELECT COUNT(*)::bigint AS total
       FROM driver_application
       WHERE status = 'PENDING_APPROVAL'`,
    );

  const itemsResult =
    await pool.query(
      `SELECT
         da.application_id,
         da.driver_id,
         da.vehicle_id,
         da.status,
         da.submitted_at,
         dp.full_name
       FROM driver_application da
       JOIN driver_profile dp
         ON dp.driver_id = da.driver_id
       WHERE da.status = 'PENDING_APPROVAL'
       ORDER BY
         da.submitted_at,
         da.application_id
       LIMIT $1
       OFFSET $2`,
      [limit, offset],
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

async function lockPendingApplication(
  driverId,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         application_id,
         driver_id,
         vehicle_id,
         status,
         submitted_at
       FROM driver_application
       WHERE driver_id = $1::bigint
         AND status = 'PENDING_APPROVAL'
       ORDER BY application_id DESC
       LIMIT 1
       FOR UPDATE`,
      [driverId],
    );

  return result.rows[0] || null;
}

async function reviewApplication(
  {
    applicationId,
    decision,
    reviewedByUserId,
    rejectionReason,
  },
  client,
) {
  const result =
    await runner(client).query(
      `UPDATE driver_application
       SET
         status = $1,
         reviewed_by_user_id = $2::bigint,
         rejection_reason = $3,
         reviewed_at = CURRENT_TIMESTAMP
       WHERE application_id = $4::bigint
       RETURNING reviewed_at`,
      [
        decision,
        reviewedByUserId,
        rejectionReason,
        applicationId,
      ],
    );

  return result.rows[0];
}

async function setApprovalStatus(
  driverId,
  decision,
  client,
) {
  await runner(client).query(
    `UPDATE driver
     SET
       approval_status = $1,
       availability_status = 'OFFLINE'
     WHERE driver_id = $2::bigint`,
    [decision, driverId],
  );
}

async function setAvailabilityByUserId(
  userId,
  availabilityStatus,
  client,
) {
  await runner(client).query(
    `UPDATE driver
     SET availability_status = $1
     WHERE user_id = $2::bigint`,
    [
      availabilityStatus,
      userId,
    ],
  );

  return findByUserId(
    userId,
    client,
  );
}

async function setBusyFromAssignment(
  driverId,
) {
  const result =
    await pool.query(
      `UPDATE driver
       SET availability_status = 'BUSY'
       WHERE driver_id = $1::bigint
         AND approval_status = 'APPROVED'
       RETURNING driver_id`,
      [driverId],
    );

  return result.rowCount > 0;
}

async function releaseBusyDriver(
  driverId,
) {
  const result =
    await pool.query(
      `UPDATE driver
       SET availability_status = 'AVAILABLE'
       WHERE driver_id = $1::bigint
         AND approval_status = 'APPROVED'
         AND availability_status = 'BUSY'
       RETURNING driver_id`,
      [driverId],
    );

  return result.rowCount > 0;
}

module.exports = {
  findByUserId,
  findByDriverId,
  lockByDriverId,
  createDriver,
  createProfile,
  updateProfile,
  createApplication,
  listDrivers,
  listPendingApplications,
  lockPendingApplication,
  reviewApplication,
  setApprovalStatus,
  setAvailabilityByUserId,
  setBusyFromAssignment,
  releaseBusyDriver,
};