'use strict';

const express =
  require('express');

const {
  createHash,
} = require(
  'node:crypto'
);

const {
  z,
} = require('zod');

const {
  grpc,
} = require(
  '../../../../shared/grpc/loader'
);

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const env =
  require(
    '../config/env'
  );

const {
  authenticate,
} = require(
  '../middleware/auth.middleware'
);

const {
  requirePermission,
} = require(
  '../middleware/authorization.middleware'
);

const {
  connectRedis,
  getRedisClient,
} = require(
  '../config/redis'
);

const {
  getBusinessClient,
  callUnary,
  buildRequestContext,
} = require(
  '../clients/grpc-clients'
);

const router =
  express.Router();

function asyncHandler(
  handler,
) {
  return (
    req,
    res,
    next,
  ) => {
    Promise
      .resolve(
        handler(
          req,
          res,
          next,
        ),
      )
      .catch(next);
  };
}

function grpcToAppError(
  error,
) {
  switch (error.code) {
    case grpc.status
      .INVALID_ARGUMENT:
      return AppError.badRequest(
        error.details ||
          'Invalid request',
        'INVALID_REQUEST',
      );

    case grpc.status
      .UNAUTHENTICATED:
      return AppError.unauthorized(
        error.details ||
          'Unauthorized',
        'UNAUTHORIZED',
      );

    case grpc.status
      .PERMISSION_DENIED:
      return AppError.forbidden(
        error.details ||
          'Forbidden',
        'FORBIDDEN',
      );

    case grpc.status
      .NOT_FOUND:
      return AppError.notFound(
        error.details ||
          'Resource not found',
        'NOT_FOUND',
      );

    case grpc.status
      .ALREADY_EXISTS:

    case grpc.status
      .FAILED_PRECONDITION:
      return AppError.conflict(
        error.details ||
          'Resource conflict',
        'CONFLICT',
      );

    case grpc.status
      .RESOURCE_EXHAUSTED:
      return AppError
        .tooManyRequests(
          error.details ||
            'Too many requests',

          'RATE_LIMITED',
        );

    case grpc.status
      .UNAVAILABLE:

    case grpc.status
      .DEADLINE_EXCEEDED:
      return new AppError(
        error.details ||
          'Internal service is unavailable',
        {
          code:
            'SERVICE_UNAVAILABLE',

          statusCode: 503,
        },
      );

    default:
      return AppError.internal(
        'Internal server error',
        'INTERNAL_ERROR',
        error,
      );
  }
}

async function call(
  serviceKey,
  method,
  request,
  timeoutMs = 7000,
) {
  try {
    return await callUnary(
      getBusinessClient(
        serviceKey,
      ),

      method,
      request,
      timeoutMs,
    );
  } catch (error) {
    throw grpcToAppError(
      error,
    );
  }
}

function parse(
  schema,
  value,
) {
  const result =
    schema.safeParse(
      value,
    );

  if (!result.success) {
    throw AppError.badRequest(
      'Request data is invalid',
      'INVALID_REQUEST',
      result.error.flatten(),
    );
  }

  return result.data;
}

const locationSchema =
  z.object({
    latitude:
      z.number()
        .min(-90)
        .max(90),

    longitude:
      z.number()
        .min(-180)
        .max(180),

    address:
      z.string()
        .trim()
        .max(255)
        .optional(),
  }).strict();

const createBookingSchema =
  z.object({
    pickup:
      locationSchema,

    destination:
      locationSchema,

    vehicleTypeId:
      z.string()
        .trim()
        .min(1)
        .max(100),
  }).strict();

const paginationSchema =
  z.object({
    page:
      z.coerce
        .number()
        .int()
        .min(1)
        .default(1),

    limit:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(5),
  });

function sha256(value) {
  return createHash(
    'sha256',
  )
    .update(value)
    .digest('hex');
}

function normalizedRequestHash(
  body,
) {
  /*
   * Fixed property order makes
   * the same normalized Booking
   * produce the same requestHash.
   */
  return sha256(
    JSON.stringify({
      pickup: {
        latitude:
          body
            .pickup
            .latitude,

        longitude:
          body
            .pickup
            .longitude,

        address:
          body
            .pickup
            .address ||
          '',
      },

      destination: {
        latitude:
          body
            .destination
            .latitude,

        longitude:
          body
            .destination
            .longitude,

        address:
          body
            .destination
            .address ||
          '',
      },

      vehicleTypeId:
        body.vehicleTypeId,
    }),
  );
}

async function resolveCustomerId(
  req,
) {
  const customer =
    await call(
      'customer',

      'getCustomerByUserId',

      {
        userId:
          req.auth.userId,

        correlationId:
          req.correlationId,
      },
    );

  return String(
    customer.customerId,
  );
}

async function existingIdempotencyRecord(
  redis,
  key,
) {
  const raw =
    await redis.get(
      key,
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    /*
     * Temporary coordination
     * metadata is corrupt:
     * remove it instead of treating
     * Redis as business source-of-truth.
     */
    await redis.del(key);
    return null;
  }
}

async function replayOrRejectIdempotency({
  req,
  res,
  redis,
  redisKey,
  requestHash,
}) {
  const current =
    await existingIdempotencyRecord(
      redis,
      redisKey,
    );

  if (!current) {
    return false;
  }

  if (
    current.requestHash !==
    requestHash
  ) {
    throw AppError.conflict(
      'The same Idempotency-Key cannot be reused with a different Booking request',
      'IDEMPOTENCY_KEY_REUSED',
    );
  }

  if (
    current.status ===
      'COMPLETED' &&
    current.bookingId
  ) {
    const booking =
      await call(
        'booking',

        'getBooking',

        {
          context:
            buildRequestContext(
              req,
            ),

          bookingId:
            String(
              current.bookingId,
            ),
        },
      );

    res.setHeader(
      'Idempotency-Replayed',
      'true',
    );

    res
      .status(201)
      .json(
        booking,
      );

    return true;
  }

  throw AppError.conflict(
    'A Booking request with this Idempotency-Key is still being processed',
    'IDEMPOTENCY_IN_PROGRESS',
  );
}

/*
 * POST /bookings
 */
router.post(
  '/bookings',

  authenticate,

  requirePermission(
    'BOOKING_CREATE',
  ),

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const body =
        parse(
          createBookingSchema,
          req.body,
        );

      const idempotencyKey =
        String(
          req.get(
            'Idempotency-Key',
          ) ||
          '',
        ).trim();

      if (
        idempotencyKey
          .length < 8 ||

        idempotencyKey
          .length > 255
      ) {
        throw AppError.badRequest(
          'Idempotency-Key header is required and must contain 8 to 255 characters',
          'INVALID_IDEMPOTENCY_KEY',
        );
      }

      /*
       * Redis namespace is locked as:
       *
       * cab:booking:idempotency:
       * <customerId>:<keyHash>
       */
      const customerId =
        await resolveCustomerId(
          req,
        );

      const keyHash =
        sha256(
          idempotencyKey,
        );

      const requestHash =
        normalizedRequestHash(
          body,
        );

      const redisKey = [
        'cab',
        'booking',
        'idempotency',
        customerId,
        keyHash,
      ].join(':');

      await connectRedis();

      const redis =
        getRedisClient();

      if (
        await replayOrRejectIdempotency({
          req,
          res,
          redis,
          redisKey,
          requestHash,
        })
      ) {
        return;
      }

      const processingRecord =
        JSON.stringify({
          requestHash,

          status:
            'PROCESSING',

          bookingId:
            null,
        });

      const acquired =
        await redis.set(
          redisKey,

          processingRecord,

          {
            NX: true,

            EX:
              env
                .BOOKING_IDEMPOTENCY_PROCESSING_TTL_SECONDS,
          },
        );

      if (!acquired) {
        if (
          await replayOrRejectIdempotency({
            req,
            res,
            redis,
            redisKey,
            requestHash,
          })
        ) {
          return;
        }

        throw AppError.conflict(
          'Unable to acquire Booking idempotency coordination lock',
          'IDEMPOTENCY_IN_PROGRESS',
        );
      }

      try {
        const booking =
          await call(
            'booking',

            'createBooking',

            {
              context:
                buildRequestContext(
                  req,
                ),

              idempotencyKey,

              pickup:
                body.pickup,

              destination:
                body.destination,

              vehicleTypeId:
                body.vehicleTypeId,
            },

            10000,
          );

        await redis.set(
          redisKey,

          JSON.stringify({
            requestHash,

            status:
              'COMPLETED',

            bookingId:
              booking.bookingId,
          }),

          {
            EX:
              env
                .BOOKING_IDEMPOTENCY_TTL_SECONDS,
          },
        );

        res
          .status(201)
          .json(
            booking,
          );
      } catch (error) {
        const current =
          await existingIdempotencyRecord(
            redis,
            redisKey,
          );

        /*
         * Delete the coordination lock only
         * for deterministic client/business
         * failures. For 5xx/timeout outcomes
         * the service may already have persisted
         * the Booking, so keeping PROCESSING until
         * TTL avoids an immediate duplicate retry.
         */
        if (
          current?.status ===
            'PROCESSING' &&

          current
            ?.requestHash ===
            requestHash &&

          error.statusCode &&
          error.statusCode < 500
        ) {
          await redis.del(
            redisKey,
          );
        }

        throw error;
      }
    },
  ),
);

/*
 * GET /bookings/{bookingId}
 */
router.get(
  '/bookings/:bookingId',

  authenticate,

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const booking =
        await call(
          'booking',

          'getBooking',

          {
            context:
              buildRequestContext(
                req,
              ),

            bookingId:
              req.params
                .bookingId,
          },
        );

      res
        .status(200)
        .json(
          booking,
        );
    },
  ),
);

/*
 * GET /customers/me/bookings
 */
router.get(
  '/customers/me/bookings',

  authenticate,

  requirePermission(
    'BOOKING_READ_SELF',
  ),

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const query =
        parse(
          paginationSchema,
          req.query,
        );

      const result =
        await call(
          'booking',

          'getMyBookings',

          {
            context:
              buildRequestContext(
                req,
              ),

            page:
              query.page,

            limit:
              query.limit,
          },
        );

      res
        .status(200)
        .json({
          page:
            result.page,

          limit:
            result.limit,

          total:
            Number(
              result.total,
            ),

          items:
            result.items,
        });
    },
  ),
);

/*
 * GET /drivers/me/offers
 */
router.get(
  '/drivers/me/offers',

  authenticate,

  requirePermission(
    'DRIVER_OFFER_RESPOND_SELF',
  ),

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const result =
        await call(
          'booking',

          'getMyDriverOffers',

          {
            context:
              buildRequestContext(
                req,
              ),
          },
        );

      res
        .status(200)
        .json(
          result.items,
        );
    },
  ),
);

/*
 * POST /driver-offers/{offerId}/accept
 */
router.post(
  '/driver-offers/:offerId/accept',

  authenticate,

  requirePermission(
    'DRIVER_OFFER_RESPOND_SELF',
  ),

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const result =
        await call(
          'booking',

          'acceptDriverOffer',

          {
            context:
              buildRequestContext(
                req,
              ),

            offerId:
              req.params
                .offerId,
          },

          10000,
        );

      res
        .status(200)
        .json(
          result,
        );
    },
  ),
);

/*
 * POST /driver-offers/{offerId}/reject
 */
router.post(
  '/driver-offers/:offerId/reject',

  authenticate,

  requirePermission(
    'DRIVER_OFFER_RESPOND_SELF',
  ),

  asyncHandler(
    async (
      req,
      res,
    ) => {
      await call(
        'booking',

        'rejectDriverOffer',

        {
          context:
            buildRequestContext(
              req,
            ),

          offerId:
            req.params
              .offerId,
        },

        10000,
      );

      res
        .status(204)
        .send();
    },
  ),
);

module.exports = router;