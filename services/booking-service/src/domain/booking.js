'use strict';

const BOOKING_STATUS =
  Object.freeze({
    CREATED:
      'CREATED',

    SEARCHING:
      'SEARCHING',

    ASSIGNED:
      'ASSIGNED',

    NO_DRIVER_FOUND:
      'NO_DRIVER_FOUND',
  });

function locationFromRow(
  row,
  prefix,
) {
  return {
    latitude:
      Number(
        row[
          `${prefix}_latitude`
        ],
      ),

    longitude:
      Number(
        row[
          `${prefix}_longitude`
        ],
      ),

    ...(row[
      `${prefix}_address`
    ]
      ? {
          address:
            row[
              `${prefix}_address`
            ],
        }
      : {}),
  };
}

function toBooking(
  row,
  assignedDriver,
) {
  const booking = {
    bookingId:
      String(
        row.booking_id,
      ),

    customerId:
      String(
        row.customer_id,
      ),

    pickup:
      locationFromRow(
        row,
        'pickup',
      ),

    destination:
      locationFromRow(
        row,
        'destination',
      ),

    vehicleTypeId:
      String(
        row
          .requested_vehicle_type_id,
      ),

    status:
      row.status,

    createdAt:
      new Date(
        row.created_at,
      ).toISOString(),
  };

  if (
    row.matching_started_at
  ) {
    booking.matchingStartedAt =
      new Date(
        row.matching_started_at,
      ).toISOString();
  }

  if (row.assigned_at) {
    booking.assignedAt =
      new Date(
        row.assigned_at,
      ).toISOString();
  }

  if (
    row.assigned_driver_id
  ) {
    booking.assignedDriver =
      assignedDriver || {
        driverId:
          String(
            row.assigned_driver_id,
          ),

        vehicle: {
          vehicleTypeId:
            String(
              row
                .requested_vehicle_type_id,
            ),
        },
      };
  }

  return booking;
}

function isTerminalBookingStatus(
  status,
) {
  return [
    BOOKING_STATUS.ASSIGNED,
    BOOKING_STATUS
      .NO_DRIVER_FOUND,
  ].includes(status);
}

module.exports = {
  BOOKING_STATUS,
  locationFromRow,
  toBooking,
  isTerminalBookingStatus,
};