'use strict';

const {
  Pool,
} = require('pg');

const pool =
  new Pool({
    host:
      process.env
        .POSTGRES_HOST ||
      'postgres',

    port:
      Number(
        process.env
          .POSTGRES_PORT ||
        5432,
      ),

    user:
      process.env
        .POSTGRES_USER,

    password:
      process.env
        .POSTGRES_PASSWORD,

    database:
      process.env
        .CUSTOMER_DB_NAME ||
      'customer_db',

    max: 10,

    idleTimeoutMillis:
      30000,

    connectionTimeoutMillis:
      3000,
  });

async function checkDatabase() {
  await pool.query(
    'SELECT 1',
  );

  return true;
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  checkDatabase,
  closeDatabase,
};