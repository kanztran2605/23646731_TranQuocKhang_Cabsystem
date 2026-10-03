'use strict';

const {
  createLogger,
} = require(
  '../../../../shared/logging/logger'
);

const bookingRepository =
  require(
    '../repositories/booking.repository'
  );

const driverClient =
  require(
    '../grpc/driver.client'
  );

const bookingPublisher =
  require(
    '../events/booking.publisher'
  );

const {
  BOOKING_STATUS,
} = require(
  '../domain/booking'
);

const logger =
  createLogger(
    'booking-service',
  );

function positiveNumber(
  name,
  fallback,
) {
  const value =
    Number(
      process.env[name] ||
      fallback,
    );

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be a positive number`,
    );
  }

  return value;
}

function positiveInteger(
  name,
  fallback,
) {
  const value =
    Number(
      process.env[name] ||
      fallback,
    );

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be a positive integer`,
    );
  }

  return value;
}

const MATCH_RADIUS_KM =
  positiveNumber(
    'BOOKING_MATCH_RADIUS_KM',
    1,
  );

const MATCH_CANDIDATE_LIMIT =
  positiveInteger(
    'BOOKING_MATCH_CANDIDATE_LIMIT',
    20,
  );

const OFFER_TTL_SECONDS =
  positiveInteger(
    'DRIVER_OFFER_TTL_SECONDS',
    60,
  );

const MATCHING_TIMEOUT_SECONDS =
  positiveInteger(
    'BOOKING_MATCHING_TIMEOUT_SECONDS',
    300,
  );

const MATCHING_RETRY_SECONDS =
  positiveInteger(
    'BOOKING_MATCHING_RETRY_SECONDS',
    5,
  );

const offerTimers =
  new Map();

const retryTimers =
  new Map();

function correlationIdForRecovery(
  bookingId,
) {
  return (
    `booking-recovery-${bookingId}`
  );
}

function clearOfferTimer(
  offerId,
) {
  const key =
    String(offerId);

  const timer =
    offerTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    offerTimers.delete(key);
  }
}

function clearMatchingRetry(
  bookingId,
) {
  const key =
    String(bookingId);

  const timer =
    retryTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(key);
  }
}

function scheduleMatchingRetry(
  bookingId,
  correlationId,
) {
  const key =
    String(bookingId);

  if (retryTimers.has(key)) {
    return;
  }

  const timer =
    setTimeout(
      () => {
        retryTimers.delete(key);

        continueMatchingSafely(
          key,
          correlationId,
        ).catch(
          (error) => {
            logger.error(
              'Booking matching retry failed unexpectedly',
              {
                bookingId: key,
                correlationId,
                error,
              },
            );
          },
        );
      },
      MATCHING_RETRY_SECONDS *
        1000,
    );

  timer.unref();

  retryTimers.set(
    key,
    timer,
  );
}

function scheduleOfferExpiration(
  offerId,
  expiresAt,
  correlationId,
) {
  clearOfferTimer(
    offerId,
  );

  const delayMs =
    Math.max(
      new Date(
        expiresAt,
      ).getTime() -
        Date.now() +
        50,
      50,
    );

  const timer =
    setTimeout(
      () => {
        offerTimers.delete(
          String(offerId),
        );

        handleOfferTimeout(
          String(offerId),
          correlationId,
        ).catch(
          (error) => {
            logger.error(
              'Driver Offer timeout processing failed',
              {
                offerId:
                  String(
                    offerId,
                  ),
                correlationId,
                error,
              },
            );
          },
        );
      },
      delayMs,
    );

  timer.unref();

  offerTimers.set(
    String(offerId),
    timer,
  );
}

function matchingDeadlineReached(
  booking,
) {
  const createdAt =
    new Date(
      booking.created_at,
    ).getTime();

  const deadline =
    createdAt +
    MATCHING_TIMEOUT_SECONDS *
      1000;

  return (
    Date.now() >=
    deadline
  );
}

async function markNoDriverFound(
  booking,
  reason,
  correlationId,
) {
  clearMatchingRetry(
    booking.booking_id,
  );

  const updated =
    await bookingRepository
      .setBookingStatus(
        booking.booking_id,
        BOOKING_STATUS
          .NO_DRIVER_FOUND,
        BOOKING_STATUS
          .SEARCHING,
      );

  if (!updated) {
    return null;
  }

  const occurredAt =
    new Date()
      .toISOString();

  try {
    await bookingPublisher
      .publishNoDriverFound({
        bookingId:
          updated.booking_id,
        customerId:
          updated.customer_id,
        reason,
        occurredAt,
        correlationId,
      });
  } catch (error) {
    logger.error(
      'booking.no_driver_found publish failed',
      {
        bookingId:
          String(
            updated.booking_id,
          ),
        correlationId,
        error,
      },
    );
  }

  return updated;
}

async function findNextCandidate(
  booking,
  correlationId,
) {
  const alreadyOffered =
    await bookingRepository
      .listOfferedDriverIds(
        booking.booking_id,
      );

  let page = 1;

  while (true) {
    const candidates =
      await driverClient
        .findEligibleDrivers({
          pickupLatitude:
            Number(
              booking
                .pickup_latitude,
            ),
          pickupLongitude:
            Number(
              booking
                .pickup_longitude,
            ),
          radiusKm:
            MATCH_RADIUS_KM,
          vehicleTypeId:
            String(
              booking
                .requested_vehicle_type_id,
            ),
          page,
          limit:
            MATCH_CANDIDATE_LIMIT,
          correlationId,
        });

    const items =
      candidates.items ||
      [];

    const candidate =
      items.find(
        (item) =>
          !alreadyOffered.has(
            String(
              item.driverId,
            ),
          ),
      );

    if (candidate) {
      return candidate;
    }

    if (
      items.length <
      MATCH_CANDIDATE_LIMIT
    ) {
      return null;
    }

    page += 1;
  }
}

async function startMatching({
  booking,
  correlationId,
}) {
  if (
    !booking ||
    booking.status !==
      BOOKING_STATUS
        .SEARCHING
  ) {
    return null;
  }

  if (
    matchingDeadlineReached(
      booking,
    )
  ) {
    return markNoDriverFound(
      booking,
      'MATCHING_TIMEOUT',
      correlationId,
    );
  }

  const existingPending =
    await bookingRepository
      .findPendingOfferForBooking(
        booking.booking_id,
      );

  if (existingPending) {
    if (
      new Date(
        existingPending.expires_at,
      ).getTime() <=
      Date.now()
    ) {
      await bookingRepository
        .expireOfferIfDue(
          existingPending.offer_id,
        );

      return startMatching({
        booking,
        correlationId,
      });
    }

    scheduleOfferExpiration(
      existingPending.offer_id,
      existingPending.expires_at,
      correlationId,
    );

    return existingPending;
  }

  /*
   * Driver eligibility is owned by
   * driver-service. Booking Service
   * never reads driver_db directly.
   */
  const candidate =
    await findNextCandidate(
      booking,
      correlationId,
    );

  if (!candidate) {
    return markNoDriverFound(
      booking,
      'NO_SUITABLE_DRIVER',
      correlationId,
    );
  }

  const expiresAt =
    new Date(
      Date.now() +
      OFFER_TTL_SECONDS *
        1000,
    );

  const offer =
    await bookingRepository
      .createDriverOffer({
        bookingId:
          booking.booking_id,
        driverId:
          candidate.driverId,
        vehicleId:
          candidate.vehicleId,
        expiresAt,
      });

  clearMatchingRetry(
    booking.booking_id,
  );

  const createdAt =
    new Date(
      offer.created_at,
    ).toISOString();

  const expiresAtIso =
    new Date(
      offer.expires_at,
    ).toISOString();

  try {
    await bookingPublisher
      .publishDriverOfferCreated({
        offerId:
          offer.offer_id,
        bookingId:
          offer.booking_id,
        driverId:
          offer.driver_id,
        expiresAt:
          expiresAtIso,
        createdAt,
        correlationId,
      });
  } catch (error) {
    logger.error(
      'driver.offer.created publish failed',
      {
        offerId:
          String(
            offer.offer_id,
          ),
        bookingId:
          String(
            offer.booking_id,
          ),
        correlationId,
        error,
      },
    );
  }

  scheduleOfferExpiration(
    offer.offer_id,
    offer.expires_at,
    correlationId,
  );

  return offer;
}

async function startMatchingSafely({
  booking,
  correlationId,
}) {
  try {
    return await startMatching({
      booking,
      correlationId,
    });
  } catch (error) {
    logger.error(
      'Driver matching failed; retry scheduled',
      {
        bookingId:
          String(
            booking.booking_id,
          ),
        correlationId,
        error,
      },
    );

    scheduleMatchingRetry(
      booking.booking_id,
      correlationId,
    );

    return null;
  }
}

async function continueMatching(
  bookingId,
  correlationId,
) {
  const booking =
    await bookingRepository
      .findBookingById(
        bookingId,
      );

  if (
    !booking ||
    booking.status !==
      BOOKING_STATUS
        .SEARCHING
  ) {
    clearMatchingRetry(
      bookingId,
    );

    return null;
  }

  return startMatching({
    booking,
    correlationId,
  });
}

async function continueMatchingSafely(
  bookingId,
  correlationId,
) {
  try {
    return await continueMatching(
      bookingId,
      correlationId,
    );
  } catch (error) {
    logger.error(
      'Driver matching continuation failed; retry scheduled',
      {
        bookingId:
          String(
            bookingId,
          ),
        correlationId,
        error,
      },
    );

    scheduleMatchingRetry(
      bookingId,
      correlationId,
    );

    return null;
  }
}

async function handleOfferTimeout(
  offerId,
  correlationId,
) {
  const expired =
    await bookingRepository
      .expireOfferIfDue(
        offerId,
      );

  if (!expired) {
    return false;
  }

  await continueMatchingSafely(
    expired.booking_id,
    correlationId,
  );

  return true;
}

async function recoverMatchingState() {
  const pendingOffers =
    await bookingRepository
      .listPendingOffersForRecovery();

  for (
    const offer
    of pendingOffers
  ) {
    const correlationId =
      correlationIdForRecovery(
        offer.booking_id,
      );

    if (
      new Date(
        offer.expires_at,
      ).getTime() <=
      Date.now()
    ) {
      await handleOfferTimeout(
        offer.offer_id,
        correlationId,
      );
    } else {
      scheduleOfferExpiration(
        offer.offer_id,
        offer.expires_at,
        correlationId,
      );
    }
  }

  const searching =
    await bookingRepository
      .listSearchingBookingsWithoutPendingOffer();

  for (
    const booking
    of searching
  ) {
    await startMatchingSafely({
      booking,
      correlationId:
        correlationIdForRecovery(
          booking.booking_id,
        ),
    });
  }
}

function stopAllTimers() {
  for (
    const timer
    of offerTimers.values()
  ) {
    clearTimeout(timer);
  }

  for (
    const timer
    of retryTimers.values()
  ) {
    clearTimeout(timer);
  }

  offerTimers.clear();
  retryTimers.clear();
}

module.exports = {
  MATCH_RADIUS_KM,
  MATCH_CANDIDATE_LIMIT,
  OFFER_TTL_SECONDS,
  MATCHING_TIMEOUT_SECONDS,
  MATCHING_RETRY_SECONDS,

  startMatching,
  startMatchingSafely,
  continueMatching,
  continueMatchingSafely,
  handleOfferTimeout,
  recoverMatchingState,

  scheduleOfferExpiration,
  scheduleMatchingRetry,
  clearOfferTimer,
  clearMatchingRetry,
  stopAllTimers,
};
