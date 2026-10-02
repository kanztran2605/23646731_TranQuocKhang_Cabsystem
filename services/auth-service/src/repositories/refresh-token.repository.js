'use strict';

const db =
  require('../config/database');

async function create({
  userId,
  tokenHash,
  expiresAt,
  deviceInfo = null,
}) {
  const result =
    await db.query(
      `INSERT INTO refresh_token
         (
           user_id,
           token_hash,
           expires_at,
           device_info
         )
       VALUES
         ($1::bigint, $2, $3, $4)
       RETURNING
         token_id::text
         AS token_id`,
      [
        userId,
        tokenHash,
        expiresAt,
        deviceInfo,
      ],
    );

  return result.rows[0];
}

async function findActiveByHash(
  tokenHash,
) {
  const result =
    await db.query(
      `SELECT
         rt.token_id::text
           AS token_id,
         rt.user_id::text
           AS user_id,
         rt.token_hash,
         rt.expires_at,
         u.phone,
         u.email,
         u.status,
         u.role_id,
         r.role_name
       FROM refresh_token rt
       JOIN user_account u
         ON u.user_id =
            rt.user_id
       JOIN role r
         ON r.role_id =
            u.role_id
       WHERE rt.token_hash = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at >
             CURRENT_TIMESTAMP
       LIMIT 1`,
      [tokenHash],
    );

  return result.rows[0] || null;
}

async function revokeByHash(
  tokenHash,
  userId = null,
) {
  const params =
    [tokenHash];

  let userClause = '';

  if (userId) {
    params.push(userId);

    userClause =
      'AND user_id = $2::bigint';
  }

  await db.query(
    `UPDATE refresh_token
     SET revoked_at =
       COALESCE(
         revoked_at,
         CURRENT_TIMESTAMP
       )
     WHERE token_hash = $1
       ${userClause}`,
    params,
  );
}

async function revokeAllForUser(
  userId,
) {
  await db.query(
    `UPDATE refresh_token
     SET revoked_at =
       COALESCE(
         revoked_at,
         CURRENT_TIMESTAMP
       )
     WHERE user_id =
           $1::bigint
       AND revoked_at IS NULL`,
    [userId],
  );
}

module.exports = {
  create,
  findActiveByHash,
  revokeByHash,
  revokeAllForUser,
};