'use strict';

const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  OPERATION_STAFF: 'OPERATION_STAFF',
  MANAGEMENT: 'MANAGEMENT',
  SYSTEM_ADMINISTRATOR: 'SYSTEM_ADMINISTRATOR',
});

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function toUserIdentity(row) {
  return {
    userId: String(row.user_id),
    phone: row.phone || '',
    email: row.email || '',
    role: row.role_name,
    accountStatus: row.status,
  };
}

module.exports = {
  ROLES,
  normalizeEmail,
  toUserIdentity,
};