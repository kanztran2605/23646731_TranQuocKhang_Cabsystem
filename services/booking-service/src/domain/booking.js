'use strict';
const BOOKING_STATUS = Object.freeze({ SEARCHING: 'SEARCHING', ASSIGNED: 'ASSIGNED', NO_DRIVER_FOUND: 'NO_DRIVER_FOUND' });
function locationFromRow(row, prefix) {
  return { latitude: Number(row[prefix + '_lat']), longitude: Number(row[prefix + '_lng']),
    ...(row[prefix + '_addr'] ? { address: row[prefix + '_addr'] } : {}) };
}
function toBooking(row) {
  return { bookingId: String(row.bid), customerId: String(row.cid), pickup: locationFromRow(row, 'p'),
    destination: locationFromRow(row, 'd'), vehicleType: row.vt, status: row.s,
    createdAt: new Date(row.c_at).toISOString(),
    ...(row.oid != null ? { offerId: String(row.oid) } : {}),
    ...(row.did != null ? { driverId: String(row.did) } : {}),
    ...(row.ass_at ? { assignedAt: new Date(row.ass_at).toISOString() } : {}) };
}
function isTerminalBookingStatus(status) { return [BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.NO_DRIVER_FOUND].includes(status); }
module.exports = { BOOKING_STATUS, locationFromRow, toBooking, isTerminalBookingStatus };
