'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:
    process.env.POSTGRES_HOST ||
    'postgres',

  port:
    Number(
      process.env.POSTGRES_PORT ||
      5432,
    ),

  user:
    process.env.POSTGRES_USER,

  password:
    process.env.POSTGRES_PASSWORD,

  database:
    process.env.DB_NAME ||
    process.env.BOOKING_DB_NAME ||
    process.env.BOOKING_DB ||
    'booking_db',

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

async function query(
  text,
  params = [],
  client = pool,
) {
  return client.query(
    text,
    params,
  );
}

async function checkDatabase() {
  await pool.query(
    'SELECT 1',
  );

  return true;
}

async function withTransaction(work) {
  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await work(client);

    await client.query(
      'COMMIT',
    );

    return result;
  } catch (error) {
    await client.query(
      'ROLLBACK',
    );

    throw error;
  } finally {
    client.release();
  }
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  checkDatabase,
  withTransaction,
  closeDatabase,
};