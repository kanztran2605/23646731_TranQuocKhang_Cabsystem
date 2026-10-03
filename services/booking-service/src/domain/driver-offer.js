'use strict';

const DRIVER_OFFER_STATUS =
  Object.freeze({
    PENDING:
      'PENDING',

    ACCEPTED:
      'ACCEPTED',

    REJECTED:
      'REJECTED',

    EXPIRED:
      'EXPIRED',
  });

function optionalLocation(
  row,
  prefix,
) {
  const latitude =
    row[
      `${prefix}_latitude`
    ];

  const longitude =
    row[
      `${prefix}_longitude`
    ];

  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return undefined;
  }

  return {
    latitude:
      Number(latitude),

    longitude:
      Number(longitude),

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

function toDriverOffer(row) {
  const pickup =
    optionalLocation(
      row,
      'pickup',
    );

  const destination =
    optionalLocation(
      row,
      'destination',
    );

  return {
    offerId:
      String(
        row.offer_id,
      ),

    bookingId:
      String(
        row.booking_id,
      ),

    driverId:
      String(
        row.driver_id,
      ),

    ...(row.vehicle_id
      ? {
          vehicleId:
            String(
              row.vehicle_id,
            ),
        }
      : {}),

    ...(pickup
      ? { pickup }
      : {}),

    ...(destination
      ? { destination }
      : {}),

    ...(row
      .requested_vehicle_type_id
      ? {
          vehicleTypeId:
            String(
              row
                .requested_vehicle_type_id,
            ),
        }
      : {}),

    status:
      row.status,

    expiresAt:
      new Date(
        row.expires_at,
      ).toISOString(),

    ...(row.responded_at
      ? {
          respondedAt:
            new Date(
              row.responded_at,
            ).toISOString(),
        }
      : {}),

    createdAt:
      new Date(
        row.created_at,
      ).toISOString(),
  };
}

module.exports = {
  DRIVER_OFFER_STATUS,
  toDriverOffer,
};