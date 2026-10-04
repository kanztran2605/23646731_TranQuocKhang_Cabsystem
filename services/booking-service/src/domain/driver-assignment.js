'use strict';
function toDriverAssignment(row) {
  return { assignmentId: String(row.aid), bookingId: String(row.bid), offerId: String(row.oid),
    driverId: String(row.did), vehicleId: String(row.vid), assignedAt: new Date(row.ass_at).toISOString() };
}
module.exports = { toDriverAssignment };
