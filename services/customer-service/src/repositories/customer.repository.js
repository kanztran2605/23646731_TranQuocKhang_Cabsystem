'use strict';
const { pool } = require('../config/database');
async function createProfile({ userId, name, address, phone }) {
  const { rows } = await pool.query(
    'INSERT INTO customer_profile (uid,name,addr,phone) VALUES ($1,$2,$3,$4) RETURNING cid,uid,name,addr,phone,c_at,u_at',
    [userId, name, address ?? null, phone ?? null]);
  return rows[0];
}
async function findById(customerId) {
  const { rows } = await pool.query('SELECT cid,uid,name,addr,phone,c_at,u_at FROM customer_profile WHERE cid=$1', [customerId]);
  return rows[0];
}
async function findByUserId(userId) {
  const { rows } = await pool.query('SELECT cid,uid,name,addr,c_at,u_at FROM customer_profile WHERE uid=$1', [userId]);
  return rows[0];
}
module.exports = { createProfile, findById, findByUserId };
