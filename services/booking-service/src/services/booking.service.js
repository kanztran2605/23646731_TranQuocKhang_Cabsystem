'use strict';

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const {
  createLogger,
} = require(
  '../../../../shared/logging/logger'
);

const {
  withTransaction,
} = require(
  '../config/database'
);

const bookingRepository =
  require(
    '../repositories/booking.repository'
  );

const customerClient =
  require(
    '../grpc/customer.client'
  );

const driverClient =
  require(
    '../grpc/driver.client'
  );

const bookingPublisher =
  require(
    '../events/booking.publisher'
  );

const driverMatchingService =
  require(
    './driver-matching.service'
  );

const {
  BOOKING_STATUS,
  toBooking,
} = require(
  '../domain/booking'
);

const {
  DRIVER_OFFER_STATUS,
  toDriverOffer,
} = require(
  '../domain/driver-offer'
);

const {
  toDriverAssignment,
} = require(
  '../domain/driver-assignment'
);

const logger =
  createLogger(
    'booking-service',
  );

function requireContext(
  context,
) {
  if (
    !context?.actorUserId ||
    !context?.actorRole
  ) {
    throw AppError
      .unauthorized();
  }
}

function requireRole(
  context,
  role,
) {
  requireContext(context);

  if (
    context.actorRole !==
    role
  ) {
    throw AppError.forbidden(
      `Only ${role} can perform this action`,
      'FORBIDDEN',
    );
  }
}

function requirePermission(
  context,
  permission,
) {
  requireContext(context);

  const permissions =
    Array.isArray(
      context.permissions,
    )
      ? context.permissions
      : [];

  if (
    !permissions.includes(
      permission,
    )
  ) {
    throw AppError.forbidden(
      'You do not have permission to perform this action',
      'FORBIDDEN',
    );
  }
}

function assertNumericId(
  value,
  fieldName,
) {
  if (
    !/^\d+$/.test(
      String(
        value ||
        '',
      ),
    )
  ) {
    throw AppError.badRequest(
      `${fieldName} is invalid`,
      'INVALID_REQUEST',
    );
  }

  return String(value);
}

function normalizeLocation(
  location,
  fieldName,
) {
  const latitude =
    Number(
      location?.latitude,
    );

  const longitude =
    Number(
      location?.longitude,
    );

  if (
    !Number.isFinite(
      latitude,
    ) ||

    latitude < -90 ||
    latitude > 90 ||

    !Number.isFinite(
      longitude,
    ) ||

    longitude < -180 ||
    longitude > 180
  ) {
    throw AppError.badRequest(
      `${fieldName} is invalid`,
      'INVALID_LOCATION',
    );
  }

  return {
    latitude,
    longitude,

    ...(location?.address
      ? {
          address:
            String(
              location.address,
            ).trim(),
        }
      : {}),
  };
}

async function resolveCustomer(
  context,
) {
  requireRole(
    context,
    'CUSTOMER',
  );

  return customerClient
    .getCustomerByUserId(
      context.actorUserId,
      context.correlationId,
    );
}

async function resolveDriver(
  context,
) {
  requireRole(
    context,
    'DRIVER',
  );

  return driverClient
    .getMyDriverProfile(
      context,
    );
}

async function assertVehicleTypeSupported(
  context,
  vehicleTypeId,
) {
  const result =
    await driverClient
      .listVehicleTypes(
        context,
      );

  const supported =
    (
      result.items ||
      []
    ).some(
      (item) =>
        String(
          item.vehicleTypeId,
        ) ===
          String(
            vehicleTypeId,
          ) &&

        item.status ===
          'ACTIVE',
    );

  if (!supported) {
    throw AppError.badRequest(
      'vehicleTypeId is not supported or is inactive',
      'INVALID_VEHICLE_TYPE',
    );
  }
}

async function assignedDriverFor(
  row,
  context,
) {
  if (
    !row.assigned_driver_id
  ) {
    return undefined;
  }

  try {
    const profile =
      await driverClient
        .getDriverById(
          context,
          row.assigned_driver_id,
        );

    return {
      driverId:
        String(
          row.assigned_driver_id,
        ),

      ...(profile.fullName
        ? {
            fullName:
              profile.fullName,
          }
        : {}),

      ...(profile.vehicle
        ? {
            vehicle:
              profile.vehicle,
          }
        : {
            vehicle: {
              vehicleTypeId:
                String(
                  row
                    .requested_vehicle_type_id,
                ),
            },
          }),
    };
  } catch (error) {
    logger.warn(
      'Assigned Driver profile composition failed',
      {
        bookingId:
          String(
            row.booking_id,
          ),

        driverId:
          String(
            row
              .assigned_driver_id,
          ),

        error,
      },
    );

    return {
      driverId:
        String(
          row
            .assigned_driver_id,
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
}

async function composeBooking(
  row,
  context,
) {
  return toBooking(
    row,

    await assignedDriverFor(
      row,
      context,
    ),
  );
}

async function createBooking(
  request,
) {
  requireRole(
    request.context,
    'CUSTOMER',
  );

  requirePermission(
    request.context,
    'BOOKING_CREATE',
  );

  if (
    typeof request
      .idempotencyKey !==
      'string' ||

    request
      .idempotencyKey
      .length < 8 ||

    request
      .idempotencyKey
      .length > 255
  ) {
    throw AppError.badRequest(
      'Idempotency-Key must contain 8 to 255 characters',
      'INVALID_IDEMPOTENCY_KEY',
    );
  }

  const pickup =
    normalizeLocation(
      request.pickup,
      'pickup',
    );

  const destination =
    normalizeLocation(
      request.destination,
      'destination',
    );

  const vehicleTypeId =
    assertNumericId(
      request.vehicleTypeId,
      'vehicleTypeId',
    );

  /*
   * Both are owned by another
   * bounded context.
   *
   * No cross-database read.
   */
  const [customer] =
    await Promise.all([
      resolveCustomer(
        request.context,
      ),

      assertVehicleTypeSupported(
        request.context,
        vehicleTypeId,
      ),
    ]);

  /*
   * Required lifecycle:
   * first persist CREATED.
   */
  const created =
    await bookingRepository
      .createBooking({
        customerId:
          customer.customerId,

        pickup,
        destination,

        vehicleTypeId,

        status:
          BOOKING_STATUS
            .CREATED,
      });

  const createdAt =
    new Date(
      created.created_at,
    ).toISOString();

  /*
   * Locked event contract:
   * publish only after Booking
   * has been persisted.
   */
  try {
    await bookingPublisher
      .publishBookingCreated({
        bookingId:
          created.booking_id,

        customerId:
          created.customer_id,

        vehicleTypeId:
          created
            .requested_vehicle_type_id,

        createdAt,

        correlationId:
          request.context
            .correlationId,
      });
  } catch (error) {
    /*
     * Booking is already source-of-truth
     * in PostgreSQL.
     *
     * We do not roll back committed
     * business data because a notification
     * event publisher is temporarily down.
     */
    logger.error(
      'booking.created publish failed',
      {
        bookingId:
          String(
            created.booking_id,
          ),

        correlationId:
          request.context
            .correlationId,

        error,
      },
    );
  }

  /*
   * CREATED -> SEARCHING.
   */
  await bookingRepository
    .setBookingStatus(
      created.booking_id,

      BOOKING_STATUS
        .SEARCHING,

      BOOKING_STATUS
        .CREATED,
    );

  const searching =
    await bookingRepository
      .findBookingById(
        created.booking_id,
      );

  await driverMatchingService
    .startMatchingSafely({
      booking:
        searching,

      correlationId:
        request.context
          .correlationId,
    });

  const current =
    await bookingRepository
      .findBookingById(
        created.booking_id,
      );

  return composeBooking(
    current,
    request.context,
  );
}

async function getBooking(
  request,
) {
  requireContext(
    request.context,
  );

  const bookingId =
    assertNumericId(
      request.bookingId,
      'bookingId',
    );

  const row =
    await bookingRepository
      .findBookingById(
        bookingId,
      );

  if (!row) {
    throw AppError.notFound(
      'Booking does not exist',
      'BOOKING_NOT_FOUND',
    );
  }

  if (
    request.context
      .actorRole ===
      'CUSTOMER'
  ) {
    requirePermission(
      request.context,
      'BOOKING_READ_SELF',
    );

    const customer =
      await resolveCustomer(
        request.context,
      );

    if (
      String(
        row.customer_id,
      ) !==
      String(
        customer.customerId,
      )
    ) {
      throw AppError.forbidden(
        'You cannot access another Customer booking',
        'FORBIDDEN',
      );
    }
  } else if (
    request.context
      .actorRole ===
      'DRIVER'
  ) {
    requirePermission(
      request.context,
      'DRIVER_OFFER_RESPOND_SELF',
    );

    const driver =
      await resolveDriver(
        request.context,
      );

    const ownsBookingRelation =
      String(
        row
          .assigned_driver_id ||
        '',
      ) ===
        String(
          driver.driverId,
        ) ||

      await bookingRepository
        .driverHasOfferForBooking(
          bookingId,
          driver.driverId,
        );

    if (
      !ownsBookingRelation
    ) {
      throw AppError.forbidden(
        'Driver is not related to this Booking',
        'FORBIDDEN',
      );
    }
  } else {
    throw AppError.forbidden(
      'Booking access is not allowed for this role',
      'FORBIDDEN',
    );
  }

  return composeBooking(
    row,
    request.context,
  );
}

async function getMyBookings(
  request,
) {
  requireRole(
    request.context,
    'CUSTOMER',
  );

  requirePermission(
    request.context,
    'BOOKING_READ_SELF',
  );

  const page =
    Number(
      request.page ||
      1,
    );

  const limit =
    Number(
      request.limit ||
      5,
    );

  if (
    !Number.isInteger(page) ||
    page < 1 ||

    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw AppError.badRequest(
      'Invalid pagination parameters',
      'INVALID_REQUEST',
    );
  }

  const customer =
    await resolveCustomer(
      request.context,
    );

  const result =
    await bookingRepository
      .listCustomerBookings({
        customerId:
          customer.customerId,

        page,
        limit,
      });

  const items = [];

  for (
    const row
    of result.rows
  ) {
    items.push(
      await composeBooking(
        row,
        request.context,
      ),
    );
  }

  return {
    page,
    limit,

    total:
      result.total,

    items,
  };
}

async function getMyDriverOffers(
  request,
) {
  requireRole(
    request.context,
    'DRIVER',
  );

  requirePermission(
    request.context,
    'DRIVER_OFFER_RESPOND_SELF',
  );

  const driver =
    await resolveDriver(
      request.context,
    );

  const rows =
    await bookingRepository
      .listPendingOffersByDriver(
        driver.driverId,
      );

  return {
    items:
      rows.map(
        toDriverOffer,
      ),
  };
}

async function acceptDriverOffer(
  request,
) {
  requireRole(
    request.context,
    'DRIVER',
  );

  requirePermission(
    request.context,
    'DRIVER_OFFER_RESPOND_SELF',
  );

  const offerId =
    assertNumericId(
      request.offerId,
      'offerId',
    );

  /*
   * Verify current Driver state again.
   * Do not trust only the state when
   * matching originally occurred.
   */
  const driver =
    await resolveDriver(
      request.context,
    );

  const outcome =
    await withTransaction(
      async (client) => {
        const offer =
          await bookingRepository
            .lockOfferById(
              offerId,
              client,
            );

        if (!offer) {
          throw AppError.notFound(
            'Driver Offer does not exist',
            'DRIVER_OFFER_NOT_FOUND',
          );
        }

        if (
          String(
            offer.driver_id,
          ) !==
          String(
            driver.driverId,
          )
        ) {
          throw AppError.forbidden(
            'Driver Offer does not belong to the current Driver',
            'FORBIDDEN',
          );
        }

        /*
         * Retry-safe accept:
         * if DB commit succeeded but
         * RabbitMQ publish failed,
         * same accept request can
         * publish driver.accepted again.
         */
        if (
          offer.status ===
          DRIVER_OFFER_STATUS
            .ACCEPTED
        ) {
          const existingAssignment =
            await bookingRepository
              .findAssignmentByOfferId(
                offerId,
                client,
              );

          if (
            !existingAssignment
          ) {
            throw AppError.conflict(
              'Accepted Offer does not have a Driver Assignment',
              'ASSIGNMENT_NOT_FOUND',
            );
          }

          return {
            offer,

            assignment:
              existingAssignment,

            replay: true,
          };
        }

        if (
          offer.status !==
          DRIVER_OFFER_STATUS
            .PENDING
        ) {
          throw AppError.conflict(
            `Driver Offer is ${offer.status}`,
            'DRIVER_OFFER_NOT_PENDING',
          );
        }

        if (
          new Date(
            offer.expires_at,
          ).getTime() <=
          Date.now()
        ) {
          await bookingRepository
            .markOfferStatus(
              offerId,

              DRIVER_OFFER_STATUS
                .EXPIRED,

              client,
            );

          return {
            offer,
            expired: true,
          };
        }

        if (
          offer.booking_status !==
          BOOKING_STATUS
            .SEARCHING
        ) {
          throw AppError.conflict(
            'Booking is no longer searching for a Driver',
            'BOOKING_NOT_SEARCHING',
          );
        }

        /*
         * Eligibility is checked only for
         * the first transition PENDING -> ACCEPTED.
         * An ACCEPTED replay must still be allowed
         * after driver-service has moved the Driver
         * to BUSY so driver.accepted can be retried.
         */
        if (
          driver.approvalStatus !==
            'APPROVED' ||

          driver
            .availabilityStatus !==
            'AVAILABLE'
        ) {
          throw AppError.conflict(
            'Driver must be APPROVED and AVAILABLE to accept an Offer',
            'DRIVER_NOT_AVAILABLE',
          );
        }

        const acceptedAt =
          new Date()
            .toISOString();

        await bookingRepository
          .markOfferStatus(
            offerId,

            DRIVER_OFFER_STATUS
              .ACCEPTED,

            client,
          );

        /*
         * UNIQUE booking_id in
         * driver_assignment guarantees
         * one Assignment per Booking.
         */
        const assignment =
          await bookingRepository
            .createAssignment(
              {
                bookingId:
                  offer.booking_id,

                offerId:
                  offer.offer_id,

                driverId:
                  offer.driver_id,

                vehicleId:
                  offer.vehicle_id,

                assignedAt:
                  acceptedAt,
              },

              client,
            );

        await bookingRepository
          .setBookingStatus(
            offer.booking_id,

            BOOKING_STATUS
              .ASSIGNED,

            BOOKING_STATUS
              .SEARCHING,

            client,
          );

        await bookingRepository
          .expireOtherPendingOffers(
            offer.booking_id,
            offer.offer_id,
            client,
          );

        return {
          offer,
          assignment,
          acceptedAt,
          replay: false,
        };
      },
    );

  driverMatchingService
    .clearOfferTimer(
      offerId,
    );

  driverMatchingService
    .clearMatchingRetry(
      outcome.offer
        .booking_id,
    );

  if (outcome.expired) {
    await driverMatchingService
      .continueMatchingSafely(
        outcome.offer
          .booking_id,

        request.context
          .correlationId,
      );

    throw AppError.conflict(
      'Driver Offer has expired',
      'DRIVER_OFFER_EXPIRED',
    );
  }

  const acceptedAt =
    outcome.acceptedAt ||
    new Date(
      outcome.assignment
        .assigned_at,
    ).toISOString();

  /*
   * Critical event.
   *
   * trip-service creates Trip.
   * driver-service switches to BUSY.
   *
   * Event has intentionally NO tripId.
   */
  try {
    await bookingPublisher
      .publishDriverAccepted({
        assignmentId:
          outcome.assignment
            .assignment_id,

        bookingId:
          outcome.offer
            .booking_id,

        customerId:
          outcome.offer
            .customer_id,

        driverId:
          outcome.offer
            .driver_id,

        vehicleId:
          outcome.offer
            .vehicle_id,

        vehicleTypeId:
          outcome.offer
            .requested_vehicle_type_id,

        acceptedAt,

        correlationId:
          request.context
            .correlationId,
      });
  } catch (error) {
    throw new AppError(
      'Driver Assignment was saved but driver.accepted could not be published; retry the same accept request',
      {
        code:
          'DRIVER_ACCEPTED_EVENT_UNAVAILABLE',

        statusCode: 503,

        cause:
          error,
      },
    );
  }

  return {
    bookingId:
      String(
        outcome.offer
          .booking_id,
      ),

    status:
      BOOKING_STATUS
        .ASSIGNED,

    assignment:
      toDriverAssignment(
        outcome.assignment,
      ),
  };
}

async function rejectDriverOffer(
  request,
) {
  requireRole(
    request.context,
    'DRIVER',
  );

  requirePermission(
    request.context,
    'DRIVER_OFFER_RESPOND_SELF',
  );

  const offerId =
    assertNumericId(
      request.offerId,
      'offerId',
    );

  const driver =
    await resolveDriver(
      request.context,
    );

  const outcome =
    await withTransaction(
      async (client) => {
        const offer =
          await bookingRepository
            .lockOfferById(
              offerId,
              client,
            );

        if (!offer) {
          throw AppError.notFound(
            'Driver Offer does not exist',
            'DRIVER_OFFER_NOT_FOUND',
          );
        }

        if (
          String(
            offer.driver_id,
          ) !==
          String(
            driver.driverId,
          )
        ) {
          throw AppError.forbidden(
            'Driver Offer does not belong to the current Driver',
            'FORBIDDEN',
          );
        }

        if (
          offer.status !==
          DRIVER_OFFER_STATUS
            .PENDING
        ) {
          throw AppError.conflict(
            `Driver Offer is ${offer.status}`,
            'DRIVER_OFFER_NOT_PENDING',
          );
        }

        if (
          offer.booking_status !==
          BOOKING_STATUS
            .SEARCHING
        ) {
          throw AppError.conflict(
            'Booking is no longer searching for a Driver',
            'BOOKING_NOT_SEARCHING',
          );
        }

        const expired =
          new Date(
            offer.expires_at,
          ).getTime() <=
          Date.now();

        await bookingRepository
          .markOfferStatus(
            offerId,

            expired
              ? DRIVER_OFFER_STATUS
                  .EXPIRED
              : DRIVER_OFFER_STATUS
                  .REJECTED,

            client,
          );

        return {
          offer,
          expired,
        };
      },
    );

  driverMatchingService
    .clearOfferTimer(
      offerId,
    );

  /*
   * AC07.04 / AC08.05:
   * Customer does not need
   * to create another Booking.
   */
  await driverMatchingService
    .continueMatchingSafely(
      outcome.offer
        .booking_id,

      request.context
        .correlationId,
    );

  if (outcome.expired) {
    throw AppError.conflict(
      'Driver Offer has expired',
      'DRIVER_OFFER_EXPIRED',
    );
  }

  return {};
}

module.exports = {
  createBooking,
  getBooking,
  getMyBookings,
  getMyDriverOffers,
  acceptDriverOffer,
  rejectDriverOffer,
};