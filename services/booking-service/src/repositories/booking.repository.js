'use strict';

const {
  pool,
} = require(
  '../config/database'
);

function runner(client) {
  return client || pool;
}

const BOOKING_SELECT = `
  SELECT
    b.booking_id,
    b.customer_id,

    b.pickup_latitude,
    b.pickup_longitude,
    b.pickup_address,

    b.destination_latitude,
    b.destination_longitude,
    b.destination_address,

    b.requested_vehicle_type_id,

    b.status,
    b.created_at,

    (
      SELECT MIN(o.created_at)
      FROM driver_offer o
      WHERE
        o.booking_id =
        b.booking_id
    ) AS matching_started_at,

    da.assignment_id,

    da.offer_id
      AS assigned_offer_id,

    da.driver_id
      AS assigned_driver_id,

    da.vehicle_id
      AS assigned_vehicle_id,

    da.assigned_at

  FROM booking b

  LEFT JOIN driver_assignment da
    ON
      da.booking_id =
      b.booking_id
`;

async function createBooking(
  {
    customerId,
    pickup,
    destination,
    vehicleTypeId,
    status,
  },
  client,
) {
  const result =
    await runner(client)
      .query(
        `INSERT INTO booking
           (
             customer_id,

             pickup_latitude,
             pickup_longitude,
             pickup_address,

             destination_latitude,
             destination_longitude,
             destination_address,

             requested_vehicle_type_id,

             status
           )
         VALUES
           (
             $1::bigint,

             $2,
             $3,
             $4,

             $5,
             $6,
             $7,

             $8::bigint,

             $9
           )
         RETURNING *`,

        [
          customerId,

          pickup.latitude,
          pickup.longitude,
          pickup.address ||
            null,

          destination.latitude,
          destination.longitude,
          destination.address ||
            null,

          vehicleTypeId,

          status,
        ],
      );

  return result.rows[0];
}

async function findBookingById(
  bookingId,
  client,
) {
  const result =
    await runner(client)
      .query(
        `${BOOKING_SELECT}
         WHERE
           b.booking_id =
           $1::bigint
         LIMIT 1`,

        [bookingId],
      );

  return (
    result.rows[0] ||
    null
  );
}

async function lockBookingById(
  bookingId,
  client,
) {
  const result =
    await runner(client)
      .query(
        `SELECT *
         FROM booking
         WHERE
           booking_id =
           $1::bigint
         FOR UPDATE`,

        [bookingId],
      );

  return (
    result.rows[0] ||
    null
  );
}

async function setBookingStatus(
  bookingId,
  nextStatus,
  expectedStatus,
  client,
) {
  const values = [
    nextStatus,
    bookingId,
  ];

  let expectedClause =
    '';

  if (expectedStatus) {
    values.push(
      expectedStatus,
    );

    expectedClause =
      `AND status = $${values.length}`;
  }

  const result =
    await runner(client)
      .query(
        `UPDATE booking
         SET
           status = $1
         WHERE
           booking_id =
           $2::bigint

           ${expectedClause}

         RETURNING *`,

        values,
      );

  return (
    result.rows[0] ||
    null
  );
}

async function listCustomerBookings({
  customerId,
  page,
  limit,
}) {
  const offset =
    (page - 1) *
    limit;

  const countResult =
    await pool.query(
      `SELECT
         COUNT(*)::bigint
           AS total
       FROM booking
       WHERE
         customer_id =
         $1::bigint`,

      [customerId],
    );

  const itemsResult =
    await pool.query(
      `${BOOKING_SELECT}

       WHERE
         b.customer_id =
         $1::bigint

       ORDER BY
         b.created_at DESC,
         b.booking_id DESC

       LIMIT $2
       OFFSET $3`,

      [
        customerId,
        limit,
        offset,
      ],
    );

  return {
    total:
      Number(
        countResult
          .rows[0]
          .total,
      ),

    rows:
      itemsResult.rows,
  };
}

async function createDriverOffer(
  {
    bookingId,
    driverId,
    vehicleId,
    expiresAt,
  },
  client,
) {
  const result =
    await runner(client)
      .query(
        `INSERT INTO driver_offer
           (
             booking_id,
             driver_id,
             vehicle_id,
             status,
             expires_at
           )
         VALUES
           (
             $1::bigint,
             $2::bigint,
             $3::bigint,
             'PENDING',
             $4::timestamptz
           )
         RETURNING *`,

        [
          bookingId,
          driverId,
          vehicleId,
          expiresAt,
        ],
      );

  return result.rows[0];
}

async function findOfferById(
  offerId,
  client,
) {
  const result =
    await runner(client)
      .query(
        `SELECT
           o.*,

           b.customer_id,

           b.pickup_latitude,
           b.pickup_longitude,
           b.pickup_address,

           b.destination_latitude,
           b.destination_longitude,
           b.destination_address,

           b.requested_vehicle_type_id,

           b.status
             AS booking_status,

           b.created_at
             AS booking_created_at

         FROM driver_offer o

         JOIN booking b
           ON
             b.booking_id =
             o.booking_id

         WHERE
           o.offer_id =
           $1::bigint

         LIMIT 1`,

        [offerId],
      );

  return (
    result.rows[0] ||
    null
  );
}

async function lockOfferById(
  offerId,
  client,
) {
  const result =
    await runner(client)
      .query(
        `SELECT
           o.*,

           b.customer_id,

           b.pickup_latitude,
           b.pickup_longitude,
           b.pickup_address,

           b.destination_latitude,
           b.destination_longitude,
           b.destination_address,

           b.requested_vehicle_type_id,

           b.status
             AS booking_status,

           b.created_at
             AS booking_created_at

         FROM driver_offer o

         JOIN booking b
           ON
             b.booking_id =
             o.booking_id

         WHERE
           o.offer_id =
           $1::bigint

         FOR UPDATE OF o, b`,

        [offerId],
      );

  return (
    result.rows[0] ||
    null
  );
}

async function findPendingOfferForBooking(
  bookingId,
) {
  const result =
    await pool.query(
      `SELECT *
       FROM driver_offer

       WHERE
         booking_id =
         $1::bigint

         AND
         status =
         'PENDING'

       ORDER BY
         created_at DESC,
         offer_id DESC

       LIMIT 1`,

      [bookingId],
    );

  return (
    result.rows[0] ||
    null
  );
}

async function listOfferedDriverIds(
  bookingId,
) {
  const result =
    await pool.query(
      `SELECT DISTINCT
         driver_id

       FROM driver_offer

       WHERE
         booking_id =
         $1::bigint`,

      [bookingId],
    );

  return new Set(
    result.rows.map(
      (row) =>
        String(
          row.driver_id,
        ),
    ),
  );
}

async function listPendingOffersByDriver(
  driverId,
) {
  const result =
    await pool.query(
      `SELECT
         o.*,

         b.pickup_latitude,
         b.pickup_longitude,
         b.pickup_address,

         b.destination_latitude,
         b.destination_longitude,
         b.destination_address,

         b.requested_vehicle_type_id

       FROM driver_offer o

       JOIN booking b
         ON
           b.booking_id =
           o.booking_id

       WHERE
         o.driver_id =
         $1::bigint

         AND
         o.status =
         'PENDING'

         AND
         o.expires_at >
         CURRENT_TIMESTAMP

         AND
         b.status =
         'SEARCHING'

       ORDER BY
         o.created_at DESC,
         o.offer_id DESC`,

      [driverId],
    );

  return result.rows;
}

async function driverHasOfferForBooking(
  bookingId,
  driverId,
) {
  const result =
    await pool.query(
      `SELECT 1
       FROM driver_offer

       WHERE
         booking_id =
         $1::bigint

         AND
         driver_id =
         $2::bigint

       LIMIT 1`,

      [
        bookingId,
        driverId,
      ],
    );

  return (
    result.rowCount > 0
  );
}

async function markOfferStatus(
  offerId,
  status,
  client,
) {
  const result =
    await runner(client)
      .query(
        `UPDATE driver_offer

         SET
           status = $1,
           responded_at =
             CURRENT_TIMESTAMP

         WHERE
           offer_id =
           $2::bigint

         RETURNING *`,

        [
          status,
          offerId,
        ],
      );

  return (
    result.rows[0] ||
    null
  );
}

async function expireOfferIfDue(
  offerId,
  client,
) {
  const result =
    await runner(client)
      .query(
        `UPDATE driver_offer

         SET
           status =
             'EXPIRED',

           responded_at =
             CURRENT_TIMESTAMP

         WHERE
           offer_id =
           $1::bigint

           AND
           status =
           'PENDING'

           AND
           expires_at <=
           CURRENT_TIMESTAMP

         RETURNING *`,

        [offerId],
      );

  return (
    result.rows[0] ||
    null
  );
}

async function expireOtherPendingOffers(
  bookingId,
  acceptedOfferId,
  client,
) {
  await runner(client)
    .query(
      `UPDATE driver_offer

       SET
         status =
           'EXPIRED',

         responded_at =
           CURRENT_TIMESTAMP

       WHERE
         booking_id =
         $1::bigint

         AND
         offer_id <>
         $2::bigint

         AND
         status =
         'PENDING'`,

      [
        bookingId,
        acceptedOfferId,
      ],
    );
}

async function createAssignment(
  {
    bookingId,
    offerId,
    driverId,
    vehicleId,
    assignedAt,
  },
  client,
) {
  const result =
    await runner(client)
      .query(
        `INSERT INTO driver_assignment
           (
             booking_id,
             offer_id,
             driver_id,
             vehicle_id,
             assigned_at
           )
         VALUES
           (
             $1::bigint,
             $2::bigint,
             $3::bigint,
             $4::bigint,
             $5::timestamptz
           )
         RETURNING *`,

        [
          bookingId,
          offerId,
          driverId,
          vehicleId,
          assignedAt,
        ],
      );

  return result.rows[0];
}

async function findAssignmentByBookingId(
  bookingId,
  client,
) {
  const result =
    await runner(client)
      .query(
        `SELECT *
         FROM driver_assignment

         WHERE
           booking_id =
           $1::bigint

         LIMIT 1`,

        [bookingId],
      );

  return (
    result.rows[0] ||
    null
  );
}

async function findAssignmentByOfferId(
  offerId,
  client,
) {
  const result =
    await runner(client)
      .query(
        `SELECT *
         FROM driver_assignment

         WHERE
           offer_id =
           $1::bigint

         LIMIT 1`,

        [offerId],
      );

  return (
    result.rows[0] ||
    null
  );
}

async function listPendingOffersForRecovery() {
  const result =
    await pool.query(
      `SELECT *
       FROM driver_offer

       WHERE
         status =
         'PENDING'

       ORDER BY
         expires_at,
         offer_id`,
    );

  return result.rows;
}

async function listSearchingBookingsWithoutPendingOffer() {
  const result =
    await pool.query(
      `${BOOKING_SELECT}

       WHERE
         b.status =
         'SEARCHING'

         AND NOT EXISTS (
           SELECT 1
           FROM driver_offer o

           WHERE
             o.booking_id =
             b.booking_id

             AND
             o.status =
             'PENDING'
         )

       ORDER BY
         b.created_at,
         b.booking_id`,
    );

  return result.rows;
}

module.exports = {
  createBooking,
  findBookingById,
  lockBookingById,
  setBookingStatus,
  listCustomerBookings,

  createDriverOffer,
  findOfferById,
  lockOfferById,

  findPendingOfferForBooking,
  listOfferedDriverIds,
  listPendingOffersByDriver,
  driverHasOfferForBooking,

  markOfferStatus,
  expireOfferIfDue,
  expireOtherPendingOffers,

  createAssignment,
  findAssignmentByBookingId,
  findAssignmentByOfferId,

  listPendingOffersForRecovery,
  listSearchingBookingsWithoutPendingOffer,
};