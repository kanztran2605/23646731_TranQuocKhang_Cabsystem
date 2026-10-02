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
      z.string()
        .min(8),

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
  });

const loginSchema =
  z.object({
    identifier:
      z.string()
        .trim()
        .min(1)
        .max(100),

    password:
      z.string()
        .min(1),
  });

const otpRequestSchema =
  z.object({
    phone:
      z.string()
        .trim()
        .min(8)
        .max(20),
  });

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
  });

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

function parse(
  schema,
  data,
) {
  const result =
    schema.safeParse(
      data,
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

function grpcToAppError(
  error,
) {
  switch (error.code) {
    case grpc.status
      .INVALID_ARGUMENT:

      return AppError
        .badRequest(
          error.details ||
            'Invalid request',

          'INVALID_REQUEST',
        );

    case grpc.status
      .UNAUTHENTICATED:

      return AppError
        .unauthorized(
          error.details ||
            'Unauthorized',

          'UNAUTHORIZED',
        );

    case grpc.status
      .PERMISSION_DENIED:

      return AppError
        .forbidden(
          error.details ||
            'Forbidden',

          'FORBIDDEN',
        );

    case grpc.status
      .NOT_FOUND:

      return AppError
        .notFound(
          error.details ||
            'Resource not found',

          'NOT_FOUND',
        );

    case grpc.status
      .ALREADY_EXISTS:

    case grpc.status
      .FAILED_PRECONDITION:

      return AppError
        .conflict(
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
        'Internal service is unavailable',
        {
          code:
            'SERVICE_UNAVAILABLE',

          statusCode:
            503,
        },
      );

    default:
      return AppError
        .internal(
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
    throw grpcToAppError(
      error,
    );
  }
}

router.post(
  '/customers/register',

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const body =
        parse(
          registerCustomerSchema,
          req.body,
        );

      const authClient =
        getBusinessClient(
          'auth',
        );

      const customerClient =
        getBusinessClient(
          'customer',
        );

      const identity =
        await call(
          authClient,

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
          customerClient,

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

      res
        .status(201)
        .json({
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
    async (
      req,
      res,
    ) => {
      const body =
        parse(
          loginSchema,
          req.body,
        );

      const authClient =
        getBusinessClient(
          'auth',
        );

      const customerClient =
        getBusinessClient(
          'customer',
        );

      const result =
        await call(
          authClient,

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

      /*
       * Current checkpoint validates
       * CUSTOMER login end-to-end.
       *
       * Driver profile composition is
       * enabled when driver-service is
       * implemented.
       *
       * We do not invent a Staff Profile
       * ownership model that is absent
       * from the locked DDD.
       */
      if (
        result.user.role !==
        'CUSTOMER'
      ) {
        throw new AppError(
          'This milestone currently composes the external LoginResponse for CUSTOMER accounts only',
          {
            code:
              'PROFILE_COMPOSITION_PENDING',

            statusCode:
              503,
          },
        );
      }

      const profile =
        await call(
          customerClient,

          'getCustomerByUserId',

          {
            userId:
              result.user
                .userId,

            correlationId:
              req.correlationId,
          },
        );

      /*
       * authentication.yaml does not
       * expose refreshToken in its
       * LoginResponse, so Gateway does
       * not leak the internal raw token.
       */
      res
        .status(200)
        .json({
          accessToken:
            result.accessToken,

          tokenType:
            result.tokenType,

          expiresIn:
            result.expiresIn,

          user: {
            userId:
              result.user
                .userId,

            fullName:
              profile.fullName,

            phone:
              result.user
                .phone,

            email:
              result.user
                .email,

            role:
              result.user
                .role,
          },
        });
    },
  ),
);

router.post(
  '/logout',

  authenticate,

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const authClient =
        getBusinessClient(
          'auth',
        );

      await call(
        authClient,
        'logout',
        {
          context:
            buildRequestContext(
              req,
            ),

          /*
           * REST contract has no
           * refresh-token body.
           * Empty means revoke all
           * active refresh tokens
           * for current User.
           */
          refreshToken: '',
        },
      );

      res
        .status(204)
        .send();
    },
  ),
);

router.post(
  '/drivers/otp/request',

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const body =
        parse(
          otpRequestSchema,
          req.body,
        );

      const authClient =
        getBusinessClient(
          'auth',
        );

      const result =
        await call(
          authClient,

          'requestDriverOtp',

          {
            phone:
              body.phone,

            correlationId:
              req.correlationId,
          },
        );

      res
        .status(200)
        .json({
          verificationId:
            result
              .verificationId,

          expiresIn:
            result
              .expiresIn,

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
    async (
      req,
      res,
    ) => {
      const body =
        parse(
          otpVerifySchema,
          req.body,
        );

      const authClient =
        getBusinessClient(
          'auth',
        );

      const result =
        await call(
          authClient,

          'verifyDriverOtp',

          {
            verificationId:
              body
                .verificationId,

            otp:
              body.otp,

            correlationId:
              req.correlationId,
          },
        );

      res
        .status(200)
        .json({
          verificationToken:
            result
              .verificationToken,

          verified:
            result.verified,
        });
    },
  ),
);

module.exports = router;