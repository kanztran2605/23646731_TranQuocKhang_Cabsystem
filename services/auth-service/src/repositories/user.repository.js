'use strict';
const { query } = require('../config/database');
async function createAccount({ email, passwordHash, role }) {
  const { rows } = await query(
    'INSERT INTO user_account (email,pw_hash,role) VALUES ($1,$2,$3) RETURNING uid,email,role,s,c_at',
    [email, passwordHash, role]);
  return rows[0];
}
async function findByEmail(email) {
  const { rows } = await query('SELECT uid,email,pw_hash,role,s,c_at FROM user_account WHERE email=$1', [email]);
  return rows[0];
}
module.exports = { createAccount, findByEmail };
