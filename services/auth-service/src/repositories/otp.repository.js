'use strict';

const db =
  require('../config/database');

async function create({
  phone,
  otpHash,
  purpose,
  expiresAt,
}) {
  const result =
    await db.query(
      `INSERT INTO otp_verification
         (
           phone,
           otp_hash,
           purpose,
           expires_at,
           attempt_count
         )
       VALUES
         ($1, $2, $3, $4, 0)
       RETURNING
         otp_id::text AS otp_id,
         phone,
         purpose,
         expires_at,
         attempt_count`,
      [
        phone,
        otpHash,
        purpose,
        expiresAt,
      ],
    );

  return result.rows[0];
}

async function findById(
  otpId,
) {
  const result =
    await db.query(
      `SELECT
         otp_id::text AS otp_id,
         phone,
         otp_hash,
         purpose,
         expires_at,
         verified_at,
         attempt_count
       FROM otp_verification
       WHERE otp_id =
             $1::bigint
       LIMIT 1`,
      [otpId],
    );

  return result.rows[0] || null;
}

async function incrementAttempt(
  otpId,
) {
  await db.query(
    `UPDATE otp_verification
     SET attempt_count =
         attempt_count + 1
     WHERE otp_id =
           $1::bigint`,
    [otpId],
  );
}

async function markVerified(
  otpId,
) {
  await db.query(
    `UPDATE otp_verification
     SET verified_at =
         CURRENT_TIMESTAMP
     WHERE otp_id =
           $1::bigint`,
    [otpId],
  );
}

module.exports = {
  create,
  findById,
  incrementAttempt,
  markVerified,
};