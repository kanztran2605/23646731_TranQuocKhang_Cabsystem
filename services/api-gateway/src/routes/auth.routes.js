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
  getBusinessClient,
  callUnary,
  buildRequestContext,
} = require(
  '../clients/grpc-clients'
);

const {
  authenticate,
} = require(
  '../middleware/auth.middleware'
);

const router =
  express.Router();

const registerCustomerSchema =
  z.object({
    password:
      z.string().min(8),

    fullName:
      z.string()
        .trim()
        .min(1)
        .max(100),

    phone:
      z.string()
        .trim()
        .min(8)
        .max(20),

    email:
      z.string()
        .trim()
        .email()
        .max(100),
  }).strict();

const loginSchema =
  z.object({
    identifier:
      z.string()
        .trim()
        .min(1)
        .max(100),

    password:
      z.string().min(1),
  }).strict();

const otpRequestSchema =
  z.object({
    phone:
      z.string()
        .trim()
        .min(8)
        .max(20),
  }).strict();

const otpVerifySchema =
  z.object({
    verificationId:
      z.string()
        .trim()
        .min(1),

    otp:
      z.string()
        .trim()
        .min(4)
        .max(10),
  }).strict();

const registerDriverSchema =
  z.object({
    verificationToken:
      z.string().min(1),

    password:
      z.string().min(8),

    fullName:
      z.string()
        .trim()
        .min(1)
        .max(100),

    phone:
      z.string()
        .trim()
        .min(8)
        .max(20),

    email:
      z.string()
        .trim()
        .email()
        .max(100),

    driverLicense:
      z.string()
        .trim()
        .min(1)
        .max(100),

    vehicle:
      z.object({
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
      }).strict(),
  }).strict();

const refreshTokenSchema =
  z.object({
    refreshToken:
      z.string().min(1),
  }).strict();

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

function parse(schema, data) {
  const result =
    schema.safeParse(data);

  if (!result.success) {
    throw AppError.badRequest(
      'Request data is invalid',
      'INVALID_REQUEST',
      result.error.flatten(),
    );
  }

  return result.data;
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

    case grpc.status.ALREADY_EXISTS:
    case grpc.status.FAILED_PRECONDITION:
      return AppError.conflict(
        error.details ||
          'Resource conflict',
        'CONFLICT',
      );

    case grpc.status.RESOURCE_EXHAUSTED:
      return AppError.tooManyRequests(
        error.details ||
          'Too many requests',
        'RATE_LIMITED',
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
  client,
  method,
  payload,
  timeoutMs = 5000,
) {
  try {
    return await callUnary(
      client,
      method,
      payload,
      timeoutMs,
    );
  } catch (error) {
    throw grpcToAppError(error);
  }
}

router.post(
  '/customers/register',

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          registerCustomerSchema,
          req.body,
        );

      const identity =
        await call(
          getBusinessClient('auth'),
          'registerCustomerIdentity',
          {
            password:
              body.password,

            phone:
              body.phone,

            email:
              body.email,

            correlationId:
              req.correlationId,
          },
        );

      const profile =
        await call(
          getBusinessClient(
            'customer',
          ),

          'createCustomerProfile',

          {
            userId:
              identity.userId,

            fullName:
              body.fullName,

            correlationId:
              req.correlationId,
          },
        );

      res.status(201).json({
        userId:
          identity.userId,

        fullName:
          profile.fullName,

        phone:
          identity.phone,

        email:
          identity.email,

        role:
          identity.role,
      });
    },
  ),
);

router.post(
  '/login',

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          loginSchema,
          req.body,
        );

      const result =
        await call(
          getBusinessClient('auth'),
          'login',
          {
            identifier:
              body.identifier,

            password:
              body.password,

            correlationId:
              req.correlationId,
          },
        );

      res.status(200).json({
        accessToken:
          result.accessToken,

        refreshToken:
          result.refreshToken,

        tokenType:
          result.tokenType,

        expiresIn:
          result.expiresIn,

        refreshExpiresIn:
          result.refreshExpiresIn,

        user:
          result.user,
      });
    },
  ),
);

router.post(
  '/logout',

  authenticate,

  asyncHandler(
    async (req, res) => {
      await call(
        getBusinessClient('auth'),
        'logout',
        {
          context:
            buildRequestContext(req),

          refreshToken:
            '',
        },
      );

      res.status(204).send();
    },
  ),
);

router.post(
  '/drivers/otp/request',

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          otpRequestSchema,
          req.body,
        );

      const result =
        await call(
          getBusinessClient('auth'),
          'requestDriverOtp',
          {
            phone:
              body.phone,

            correlationId:
              req.correlationId,
          },
        );

      res.status(200).json({
        verificationId:
          result.verificationId,

        expiresIn:
          result.expiresIn,

        message:
          result.message,

        ...(result.devOtp
          ? {
              devOtp:
                result.devOtp,
            }
          : {}),
      });
    },
  ),
);

router.post(
  '/drivers/otp/verify',

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          otpVerifySchema,
          req.body,
        );

      const result =
        await call(
          getBusinessClient('auth'),
          'verifyDriverOtp',
          {
            verificationId:
              body.verificationId,

            otp:
              body.otp,

            correlationId:
              req.correlationId,
          },
        );

      res.status(200).json({
        verificationToken:
          result.verificationToken,

        verified:
          result.verified,
      });
    },
  ),
);

router.post(
  '/drivers/register',

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          registerDriverSchema,
          req.body,
        );

      const identity =
        await call(
          getBusinessClient('auth'),

          'registerDriverIdentity',

          {
            verificationToken:
              body.verificationToken,

            password:
              body.password,

            phone:
              body.phone,

            email:
              body.email,

            correlationId:
              req.correlationId,
          },
        );

      const registration =
        await call(
          getBusinessClient('driver'),

          'registerDriverProfile',

          {
            userId:
              identity.userId,

            fullName:
              body.fullName,

            driverLicense:
              body.driverLicense,

            vehicle: {
              vehicleTypeId:
                body.vehicle
                  .vehicleTypeId,

              licensePlate:
                body.vehicle
                  .licensePlate,

              brand:
                body.vehicle.brand ||
                '',

              model:
                body.vehicle.model ||
                '',
            },

            correlationId:
              req.correlationId,
          },
        );

      res.status(201).json({
        driverId:
          registration.driverId,

        userId:
          registration.userId,

        approvalStatus:
          registration
            .approvalStatus,

        message:
          registration.message ||
          'Driver profile created and pending approval',
      });
    },
  ),
);

router.post(
  '/refresh',

  asyncHandler(
    async (req, res) => {
      const body =
        parse(
          refreshTokenSchema,
          req.body,
        );

      const result =
        await call(
          getBusinessClient('auth'),

          'refreshAccessToken',

          {
            refreshToken:
              body.refreshToken,

            correlationId:
              req.correlationId,
          },
        );

      res.status(200).json({
        accessToken:
          result.accessToken,

        refreshToken:
          result.refreshToken,

        tokenType:
          result.tokenType,

        expiresIn:
          result.expiresIn,

        refreshExpiresIn:
          result.refreshExpiresIn,

        user:
          result.user,
      });
    },
  ),
);

module.exports = router;