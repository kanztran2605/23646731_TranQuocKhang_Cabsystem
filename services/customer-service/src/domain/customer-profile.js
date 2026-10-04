'use strict';
function toCustomerProfile(row) {
  return { customerId: String(row.cid), userId: String(row.uid), name: row.name,
    ...(row.addr !== null && row.addr !== undefined ? { address: row.addr } : {}),
    createdAt: new Date(row.c_at).toISOString(), updatedAt: new Date(row.u_at).toISOString() };
}
module.exports = { toCustomerProfile };
