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

async function findByCustomerId(
  customerId,
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
       WHERE customer_id =
             $1::bigint
       LIMIT 1`,
      [customerId],
    );

  return result.rows[0] || null;
}

async function updateByUserId(
  userId,
  patch,
) {
  const sets = [];
  const values = [];

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'fullName',
    )
  ) {
    values.push(
      patch.fullName,
    );

    sets.push(
      `full_name = $${values.length}`,
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'address',
    )
  ) {
    values.push(
      patch.address,
    );

    sets.push(
      `address = $${values.length}`,
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'dateOfBirth',
    )
  ) {
    values.push(
      patch.dateOfBirth,
    );

    sets.push(
      `date_of_birth = $${values.length}::date`,
    );
  }

  if (sets.length === 0) {
    return findByUserId(
      userId,
    );
  }

  values.push(
    userId,
  );

  const result =
    await pool.query(
      `UPDATE customer_profile
       SET ${sets.join(', ')}
       WHERE user_id =
             $${values.length}::bigint
       RETURNING
         customer_id::text
           AS customer_id,
         user_id::text
           AS user_id,
         full_name,
         address,
         date_of_birth`,
      values,
    );

  return result.rows[0] || null;
}

async function listCustomers({
  keyword = null,
  page,
  pageSize,
}) {
  const normalizedKeyword =
    keyword?.trim() ||
    null;

  const offset =
    (page - 1) *
    pageSize;

  /*
   * keyword searches Customer Profile
   * full_name, which belongs to
   * customer-service.
   *
   * Phone/email belong to auth-service
   * and are composed at Gateway.
   */
  const countResult =
    await pool.query(
      `SELECT COUNT(*)::bigint
         AS total
       FROM customer_profile
       WHERE (
         $1::text IS NULL
         OR full_name ILIKE
            '%' || $1 || '%'
       )`,
      [normalizedKeyword],
    );

  const itemsResult =
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
       WHERE (
         $1::text IS NULL
         OR full_name ILIKE
            '%' || $1 || '%'
       )
       ORDER BY customer_id
       LIMIT $2
       OFFSET $3`,
      [
        normalizedKeyword,
        pageSize,
        offset,
      ],
    );

  return {
    page,
    pageSize,

    total:
      Number(
        countResult
          .rows[0]
          .total,
      ),

    items:
      itemsResult.rows,
  };
}

module.exports = {
  createProfile,
  findByUserId,
  findByCustomerId,
  updateByUserId,
  listCustomers,
};