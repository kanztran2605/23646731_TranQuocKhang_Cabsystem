'use strict';

const db =
  require('../config/database');

function runner(client) {
  return client || db.pool;
}

async function findByIdentifier(
  identifier,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         u.user_id::text AS user_id,
         u.phone,
         u.email,
         u.password_hash,
         u.status,
         u.role_id,
         r.role_name
       FROM user_account u
       JOIN role r
         ON r.role_id = u.role_id
       WHERE LOWER(u.email) = LOWER($1)
          OR u.phone = $1
       LIMIT 1`,
      [identifier],
    );

  return result.rows[0] || null;
}

async function findById(
  userId,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         u.user_id::text AS user_id,
         u.phone,
         u.email,
         u.password_hash,
         u.status,
         u.role_id,
         r.role_name
       FROM user_account u
       JOIN role r
         ON r.role_id = u.role_id
       WHERE u.user_id = $1::bigint
       LIMIT 1`,
      [userId],
    );

  return result.rows[0] || null;
}

async function findDuplicate(
  phone,
  email,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         user_id::text AS user_id
       FROM user_account
       WHERE phone = $1
          OR LOWER(email) = LOWER($2)
       LIMIT 1`,
      [phone, email],
    );

  return result.rows[0] || null;
}

async function createUser({
  phone,
  email,
  passwordHash,
  roleName,
}) {
  return db.withTransaction(
    async (client) => {
      const roleResult =
        await client.query(
          `SELECT
             role_id,
             role_name
           FROM role
           WHERE role_name = $1
           LIMIT 1`,
          [roleName],
        );

      if (
        !roleResult.rows.length
      ) {
        const error =
          new Error(
            `Role not configured: ${roleName}`,
          );

        error.code =
          'ROLE_NOT_CONFIGURED';

        throw error;
      }

      const role =
        roleResult.rows[0];

      const insert =
        await client.query(
          `INSERT INTO user_account
             (
               phone,
               email,
               password_hash,
               role_id,
               status
             )
           VALUES
             ($1, $2, $3, $4, 'ACTIVE')
           RETURNING
             user_id::text AS user_id,
             phone,
             email,
             status,
             role_id`,
          [
            phone,
            email,
            passwordHash,
            role.role_id,
          ],
        );

      return {
        ...insert.rows[0],
        role_name:
          role.role_name,
      };
    },
  );
}

async function getPermissionsForUser(
  userId,
  client,
) {
  const result =
    await runner(client).query(
      `SELECT p.permission_code
       FROM user_account u
       JOIN role_permission rp
         ON rp.role_id = u.role_id
       JOIN permission p
         ON p.permission_id =
            rp.permission_id
       WHERE u.user_id =
             $1::bigint
       ORDER BY
         p.permission_code`,
      [userId],
    );

  return result.rows.map(
    (row) =>
      row.permission_code,
  );
}

async function listRoles(
  client,
) {
  const result =
    await runner(client).query(
      `SELECT
         r.role_id::text AS role_id,
         r.role_name,
         COALESCE(
           ARRAY_AGG(
             p.permission_code
             ORDER BY p.permission_code
           )
           FILTER (
             WHERE p.permission_code
                   IS NOT NULL
           ),
           ARRAY[]::text[]
         ) AS permissions
       FROM role r
       LEFT JOIN role_permission rp
         ON rp.role_id = r.role_id
       LEFT JOIN permission p
         ON p.permission_id =
            rp.permission_id
       GROUP BY
         r.role_id,
         r.role_name
       ORDER BY r.role_id`,
    );

  return result.rows;
}

async function replaceRolePermissions(
  roleId,
  permissionCodes,
) {
  return db.withTransaction(
    async (client) => {
      const roleResult =
        await client.query(
          `SELECT
             role_id::text AS role_id,
             role_name
           FROM role
           WHERE role_id = $1::bigint
           LIMIT 1`,
          [roleId],
        );

      if (
        !roleResult.rows.length
      ) {
        return null;
      }

      const uniqueCodes = [
        ...new Set(
          permissionCodes,
        ),
      ];

      if (
        uniqueCodes.length > 0
      ) {
        const permissionResult =
          await client.query(
            `SELECT permission_code
             FROM permission
             WHERE permission_code =
                   ANY($1::text[])`,
            [uniqueCodes],
          );

        if (
          permissionResult.rowCount !==
          uniqueCodes.length
        ) {
          const error =
            new Error(
              'One or more permission codes do not exist',
            );

          error.code =
            'INVALID_PERMISSION';

          throw error;
        }
      }

      await client.query(
        `DELETE
         FROM role_permission
         WHERE role_id =
               $1::bigint`,
        [roleId],
      );

      if (
        uniqueCodes.length > 0
      ) {
        await client.query(
          `INSERT INTO role_permission
             (
               role_id,
               permission_id
             )
           SELECT
             $1::bigint,
             permission_id
           FROM permission
           WHERE permission_code =
                 ANY($2::text[])`,
          [
            roleId,
            uniqueCodes,
          ],
        );
      }

      return {
        ...roleResult.rows[0],

        permissions:
          uniqueCodes.sort(),
      };
    },
  );
}

module.exports = {
  findByIdentifier,
  findById,
  findDuplicate,
  createUser,
  getPermissionsForUser,
  listRoles,
  replaceRolePermissions,
};