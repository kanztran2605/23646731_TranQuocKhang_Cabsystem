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
      return AppError.unauthorized();

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

const vehicleSchema =
  z.object({
    driverId:
      z.string()
        .regex(/^\d+$/),

    vehicleTypeId:
      z.string()
        .regex(/^\d+$/),

    licensePlate:
      z.string()
        .trim()
        .min(1)
        .max(20),

    brand:
      z.string()
        .trim()
        .max(50)
        .optional(),

    model:
      z.string()
        .trim()
        .max(50)
        .optional(),
  }).strict();

function parseBody(req) {
  const result =
    vehicleSchema.safeParse(
      req.body,
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

router.get(
  '/vehicle-types',
  authenticate,

  asyncHandler(
    async (req, res) => {
      const result =
        await call(
          'listVehicleTypes',
          {
            context:
              buildRequestContext(req),
          },
        );

      res.status(200).json(
        result.items,
      );
    },
  ),
);

router.get(
  '/vehicles',
  authenticate,
  requirePermission(
    'VEHICLE_MANAGE',
  ),

  asyncHandler(
    async (req, res) => {
      const result =
        await call(
          'listVehicles',
          {
            context:
              buildRequestContext(req),
          },
        );

      res.status(200).json(
        result.items,
      );
    },
  ),
);

router.post(
  '/vehicles',
  authenticate,
  requirePermission(
    'VEHICLE_MANAGE',
  ),

  asyncHandler(
    async (req, res) => {
      const body =
        parseBody(req);

      const result =
        await call(
          'createVehicle',
          {
            context:
              buildRequestContext(req),
            ...body,
          },
        );

      res.status(201).json(result);
    },
  ),
);

router.put(
  '/vehicles/:vehicleId',
  authenticate,
  requirePermission(
    'VEHICLE_MANAGE',
  ),

  asyncHandler(
    async (req, res) => {
      const body =
        parseBody(req);

      const result =
        await call(
          'updateVehicle',
          {
            context:
              buildRequestContext(req),

            vehicleId:
              req.params.vehicleId,

            ...body,
          },
        );

      res.status(200).json(result);
    },
  ),
);

module.exports = router;