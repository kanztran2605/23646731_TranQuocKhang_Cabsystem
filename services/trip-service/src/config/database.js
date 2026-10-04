'use strict';
const { Pool } = require('pg');
const pool = new Pool({ host:process.env.POSTGRES_HOST || 'postgres',port:Number(process.env.POSTGRES_PORT || 5432),
  user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.TRIP_DB_NAME || 'trip_db',
  max:10,connectionTimeoutMillis:2000,idleTimeoutMillis:30000 });
async function withTransaction(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
module.exports = { pool,withTransaction,checkDatabase:async () => { await pool.query('SELECT 1'); },closeDatabase:() => pool.end() };
