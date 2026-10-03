'use strict';

function toDriverAssignment(
  row,
) {
  return {
    assignmentId:
      String(
        row.assignment_id,
      ),

    bookingId:
      String(
        row.booking_id,
      ),

    offerId:
      String(
        row.offer_id,
      ),

    driverId:
      String(
        row.driver_id,
      ),

    vehicleId:
      String(
        row.vehicle_id,
      ),

    assignedAt:
      new Date(
        row.assigned_at,
      ).toISOString(),
  };
}

module.exports = {
  toDriverAssignment,
};