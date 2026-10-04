'use strict';
const ROLES = Object.freeze({ CUSTOMER: 'CUSTOMER', DRIVER: 'DRIVER', ADMIN: 'ADMIN' });
function normalizeEmail(email) { return email.trim().toLowerCase(); }
function toAccount(row) {
  return { userId: String(row.uid), email: row.email, role: row.role, status: row.s, createdAt: new Date(row.c_at).toISOString() };
}
module.exports = { ROLES, normalizeEmail, toAccount };
