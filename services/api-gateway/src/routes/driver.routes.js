'use strict';

const express =
  require('express');

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
  getBusinessClient,
  callUnary,
  buildRequestContext,
} = require(
  '../clients/grpc-clients'
);

const router =
  express.Router();

function asyncHandler(handler) {
  return (
    req,
    res,
    next,
  ) => {
    Promise
      .resolve(
        handler(req, res, next),
      )
      .catch(next);
  };
}

function grpcToAppError(error) {
  switch (error.code) {
    case grpc.status.INVALID_ARGUMENT:
      return AppError.badRequest(
        error.details ||
          'Invalid request',
        'INVALID_REQUEST',
      );

    case grpc.status.UNAUTHENTICATED:
      return AppError.unauthorized(
        error.details ||
          'Unauthorized',
        'UNAUTHORIZED',
      );

    case grpc.status.PERMISSION_DENIED:
      return AppError.forbidden(
        error.details ||
          'Forbidden',
        'FORBIDDEN',
      );

    case grpc.status.NOT_FOUND:
      return AppError.notFound(
        error.details ||
          'Resource not found',
        'NOT_FOUND',
      );

    case grpc.status.FAILED_PRECONDITION:
    case grpc.status.ALREADY_EXISTS:
      return AppError.conflict(
        error.details ||
          'Resource conflict',
        'CONFLICT',
      );

    case grpc.status.UNAVAILABLE:
    case grpc.status.DEADLINE_EXCEEDED:
      return new AppError(
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
  method,
  request,
) {
  try {
    return await callUnary(
      getBusinessClient('driver'),
      method,
      request,
      5000,
    );
  } catch (error) {
    throw grpcToAppError(error);
  }
}

function parse(schema, value) {
  const result =
    schema.safeParse(value);

  if (!result.success) {
    throw AppError.badRequest(
      'Request data is invalid',
      'INVALID_REQUEST',
      result.error.flatten(),
    );
  }

  return result.data;
}

function isValidIsoDate(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(value)
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] = value
    .split('-')
    .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() === day
  );
}

const updateDriverSchema =
  z.object({
    fullName:
      z.string()
        .trim()
        .min(1)
        .max(100)
        .optional(),

    address:
      z.string()
        .trim()
        .max(255)
        .optional(),

    dateOfBirth:
      z.string()
        .refine(
          isValidIsoDate,
          'dateOfBirth must be a valid YYYY-MM-DD date',
        )
        .optional(),

    driverLicense:
      z.string()
        .trim()
        .min(1)
        .max(100)
        .optional(),
  })
    .strict()
    .refine(
      (value) =>
        Object.keys(value).length > 0,
      'At least one Driver field is required',
    );

const nearbyQuerySchema =
  z.object({
    lat:
      z.coerce
        .number()
        .min(-90)
        .max(90),

    lng:
      z.coerce
        .number()
        .min(-180)
        .max(180),

    radius:
      z.coerce
        .number()
        .min(0.1)
        .max(50)
        .default(1),

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

const listQuerySchema =
  z.object({
    approvalStatus:
      z.enum([
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
      ]).optional(),

    availabilityStatus:
      z.enum([
        'OFFLINE',
        'AVAILABLE',
        'BUSY',
      ]).optional(),

    vehicleTypeId:
      z.string()
        .regex(/^\d+$/)
        .optional(),

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
        .default(20),
  });

const availabilitySchema =
  z.object({
    online:
      z.boolean(),
  }).strict();

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
  }).strict();

const approvalSchema =
  z.object({
    decision:
      z.enum([
        'APPROVED',
        'REJECTED',
      ]),

    reason:
      z.string()
        .trim()
        .min(1)
        .max(255)
        .optional(),
  })
    .strict()
    .superRefine(
      (value, context) => {
        if (
          value.decision ===
            'REJECTED' &&
          !value.reason
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,
            path: ['reason'],
            message:
              'reason is required when decision is REJECTED',
          });
        }
      },
    );

router.get(
  '/me',
  authenticate,

  asyncHandler(
    async (req, res) => {
      const result =
        await call(
          'getMyDriverProfile',
          {
            context:
              buildRequestContext(req),
          },
        );

      res.status(200).json(result);
    },
  ),
);

router.get(
  '/nearby',
  authenticate,
  requirePermission(
    'DRIVER_MANAGE',
  ),

  asyncHandler(
    async (req, res) => {
      const query =
        parse(
          nearbyQuerySchema,
          req.query,
        );

      const result =
        await call(
          'getNearbyDrivers',
          {
            context:
              buildRequestContext(req),
            latitude:
              query.lat,
            longitude:
              query.lng,
            radiusKm:
              query.radius,
            page:
              query.page,
            limit:
              query.limit,
          },
        );

      res.status(200).json({
        page: result.page,
        limit: result.limit,
        total:
          Number(result.total),
        items: result.items,
      });
    },
  ),
);

router.get(
  '/pending-approval',
  authenticate,
  requirePermission(
    'DRIVER_APPROVE',
  ),

  asyncHandler(
    async (req, res) => {
      const query =
        parse(
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
                .default(20),
          }),
          req.query,
        );

      const result =
        await call(
          'getPendingDriverApplications',
          {
            context:
              buildRequestContext(req),
            page: query.page,
            limit: query.limit,
          },
        );

      res.status(200).json({
        page: result.page,
        limit: result.limit,
        total:
          Number(result.total),
        items: result.items,
      });
    },
  ),
);

router.get(
  '/',
  authenticate,
  requirePermission(
    'DRIVER_MANAGE',
  ),

  asyncHandler(
    async (req, res) => {
      const query =
        parse(
          listQuerySchema,
          req.query,
        );

      const result =
        await call(
          'listDrivers',
          {
            context:
              buildRequestContext(req),

            approvalStatus:
              query.approvalStatus || '',

            availabilityStatus:
              query.availabilityStatus || '',

            vehicleTypeId:
              query.vehicleTypeId || '',

            page: query.page,
            limit: query.limit,
          },
        );

      res.status(200).json(
        result.items,
      );
    },
  ),
);

router.patch(
  '/me/availability',
  authenticate,

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          availabilitySchema,
          req.body,
        );

      const result =
        await call(
          'updateMyAvailability',
          {
            context:
              buildRequestContext(req),
            online: body.online,
          },
        );

      res.status(200).json(result);
    },
  ),
);

router.put(
  '/me/location',
  authenticate,

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          locationSchema,
          req.body,
        );

      const result =
        await call(
          'updateMyLocation',
          {
            context:
              buildRequestContext(req),
            latitude:
              body.latitude,
            longitude:
              body.longitude,
          },
        );

      res.status(200).json({
        latitude:
          result.latitude,
        longitude:
          result.longitude,
      });
    },
  ),
);

router.patch(
  '/:driverId/approval',
  authenticate,
  requirePermission(
    'DRIVER_APPROVE',
  ),

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          approvalSchema,
          req.body,
        );

      const result =
        await call(
          'approveOrRejectDriver',
          {
            context:
              buildRequestContext(req),

            driverId:
              req.params.driverId,

            decision:
              body.decision,

            reason:
              body.reason || '',
          },
        );

      res.status(200).json(result);
    },
  ),
);

router.get(
  '/:driverId',
  authenticate,

  asyncHandler(
    async (req, res) => {
      const result =
        await call(
          'getDriverById',
          {
            context:
              buildRequestContext(req),

            driverId:
              req.params.driverId,
          },
        );

      res.status(200).json(result);
    },
  ),
);

router.put(
  '/:driverId',
  authenticate,
  requirePermission(
    'DRIVER_MANAGE',
  ),

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          updateDriverSchema,
          req.body,
        );

      const result =
        await call(
          'updateDriver',
          {
            context:
              buildRequestContext(req),

            driverId:
              req.params.driverId,

            ...body,
          },
        );

      res.status(200).json(result);
    },
  ),
);

module.exports = router;