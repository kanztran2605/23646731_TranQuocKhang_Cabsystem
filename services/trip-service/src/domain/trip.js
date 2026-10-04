'use strict';
function toTrip(row) {
  return { tripId: String(row.tid), bookingId: String(row.bid), customerId: String(row.cid),
    driverId: String(row.did), vehicleId: String(row.vid), status: row.s, paid: row.paid,
    ...(row.r != null ? { cancelReason: row.r } : {}),
    createdAt: new Date(row.c_at).toISOString(), updatedAt: new Date(row.u_at).toISOString(),
    ...(row.done_at ? { completedAt: new Date(row.done_at).toISOString() } : {}),
    ...(row.can_at ? { canceledAt: new Date(row.can_at).toISOString() } : {}) };
}
function toLocation(row) {
  return { locationId: String(row.lid), tripId: String(row.tid), latitude: Number(row.lat),
    longitude: Number(row.lng), recordedAt: new Date(row.rec_at).toISOString() };
}
module.exports = { toTrip, toLocation };
