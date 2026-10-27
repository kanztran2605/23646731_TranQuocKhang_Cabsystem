'use strict';
const { query } = require('../config/database');
async function createAccount({ email, passwordHash, role, registrationId }) {
  const { rows } = await query(
    'INSERT INTO user_account (email,pw_hash,role,s,registration_id,registration_done) VALUES ($1,$2,$3,$4,$5,$6) RETURNING uid,email,role,s,c_at',
    [email, passwordHash, role, registrationId ? 'INACTIVE' : 'ACTIVE', registrationId ?? null, !registrationId]);
  return rows[0];
}
async function findByEmail(email) {
  const { rows } = await query('SELECT uid,email,pw_hash,role,s,c_at,registration_id,registration_done FROM user_account WHERE email=$1', [email]);
  return rows[0];
}
async function claimRegistration(uid, previous, next) {
  return (await query("UPDATE user_account SET registration_id=$3 WHERE uid=$1 AND registration_id=$2 AND s='INACTIVE' AND role='DRIVER' AND registration_done=false RETURNING uid,email,role,s,c_at", [uid,previous,next])).rows[0];
}
async function completeRegistration(uid, registrationId) {
  return (await query("UPDATE user_account SET s='ACTIVE',registration_done=true WHERE uid=$1 AND registration_id=$2 AND role='DRIVER' AND (registration_done=false OR s='ACTIVE') RETURNING uid,email,role,s,c_at", [uid,registrationId])).rows[0];
}
module.exports = { createAccount, findByEmail, claimRegistration, completeRegistration };
