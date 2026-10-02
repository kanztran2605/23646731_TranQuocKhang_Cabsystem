'use strict';

const {
  pool,
} = require(
  '../config/database'
);

async function createProfile({
  userId,
  fullName,
}) {
  const result =
    await pool.query(
      `INSERT INTO customer_profile
         (
           user_id,
           full_name
         )
       VALUES
         ($1::bigint, $2)
       RETURNING
         customer_id::text
           AS customer_id,
         user_id::text
           AS user_id,
         full_name,
         address,
         date_of_birth`,
      [
        userId,
        fullName,
      ],
    );

  return result.rows[0];
}

async function findByUserId(
  userId,
) {
  const result =
    await pool.query(
      `SELECT
         customer_id::text
           AS customer_id,
         user_id::text
           AS user_id,
         full_name,
         address,
         date_of_birth
       FROM customer_profile
       WHERE user_id =
             $1::bigint
       LIMIT 1`,
      [userId],
    );

  return result.rows[0] || null;
}

module.exports = {
  createProfile,
  findByUserId,
};