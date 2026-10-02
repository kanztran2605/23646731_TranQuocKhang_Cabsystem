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

      return AppError
        .conflict(
          error.details ||
            'Resource conflict',
          'CONFLICT',
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
  request,
) {
  try {
    return await callUnary(
      client,
      method,
      request,
      5000,
    );
  } catch (error) {
    throw grpcToAppError(
      error,
    );
  }
}

function isValidIsoDate(
  value,
) {
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
    date.getUTCFullYear() ===
      year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() ===
      day
  );
}

const updateProfileSchema =
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
  })
    .strict()
    .refine(
      (value) =>
        Object.keys(value)
          .length > 0,

      'At least one profile field is required',
    );

const customerListQuerySchema =
  z.object({
    keyword:
      z.string()
        .trim()
        .max(100)
        .optional(),

    page:
      z.coerce
        .number()
        .int()
        .min(1)
        .default(1),

    pageSize:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20),
  });

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

function assertCustomerProfileRole(
  req,
) {
  if (
    req.auth.role !==
    'CUSTOMER'
  ) {
    throw AppError.forbidden(
      'Current profile is not owned by customer-service',
      'FORBIDDEN',
    );
  }
}

function composeMyProfile(
  identity,
  profile,
) {
  return {
    userId:
      identity.userId,

    customerId:
      profile.customerId,

    fullName:
      profile.fullName,

    phone:
      identity.phone,

    email:
      identity.email,

    address:
      profile.address ||
      null,

    dateOfBirth:
      profile.dateOfBirth ||
      null,

    role:
      identity.role,

    status:
      identity.accountStatus,
  };
}

function composeCustomer(
  identity,
  profile,
) {
  return {
    customerId:
      profile.customerId,

    userId:
      profile.userId,

    fullName:
      profile.fullName,

    phone:
      identity.phone,

    email:
      identity.email,

    address:
      profile.address ||
      null,

    dateOfBirth:
      profile.dateOfBirth ||
      null,

    status:
      identity.accountStatus,
  };
}

/*
 * GET /users/me
 */
router.get(
  '/me',

  authenticate,

  asyncHandler(
    async (
      req,
      res,
    ) => {
      assertCustomerProfileRole(
        req,
      );

      const authClient =
        getBusinessClient(
          'auth',
        );

      const customerClient =
        getBusinessClient(
          'customer',
        );

      const [
        identity,
        profile,
      ] =
        await Promise.all([
          call(
            authClient,
            'getUserIdentity',
            {
              context:
                buildRequestContext(
                  req,
                ),

              userId:
                req.auth.userId,
            },
          ),

          call(
            customerClient,
            'getMyProfile',
            {
              context:
                buildRequestContext(
                  req,
                ),
            },
          ),
        ]);

      res
        .status(200)
        .json(
          composeMyProfile(
            identity,
            profile,
          ),
        );
    },
  ),
);

/*
 * PUT /users/me
 */
router.put(
  '/me',

  authenticate,

  asyncHandler(
    async (
      req,
      res,
    ) => {
      assertCustomerProfileRole(
        req,
      );

      const body =
        parse(
          updateProfileSchema,
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

      const profile =
        await call(
          customerClient,

          'updateMyProfile',

          {
            context:
              buildRequestContext(
                req,
              ),

            ...body,
          },
        );

      const identity =
        await call(
          authClient,

          'getUserIdentity',

          {
            context:
              buildRequestContext(
                req,
              ),

            userId:
              req.auth.userId,
          },
        );

      res
        .status(200)
        .json(
          composeMyProfile(
            identity,
            profile,
          ),
        );
    },
  ),
);

/*
 * GET /users/customers
 */
router.get(
  '/customers',

  authenticate,
  requirePermission(
    'CUSTOMER_READ',
  ),

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const query =
        parse(
          customerListQuerySchema,
          req.query,
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
          customerClient,

          'listCustomers',

          {
            context:
              buildRequestContext(
                req,
              ),

            keyword:
              query.keyword ||
              '',

            page:
              query.page,

            pageSize:
              query.pageSize,
          },
        );

      const items =
        await Promise.all(
          result.items.map(
            async (
              profile,
            ) => {
              const identity =
                await call(
                  authClient,

                  'getUserIdentity',

                  {
                    context:
                      buildRequestContext(
                        req,
                      ),

                    userId:
                      profile.userId,
                  },
                );

              return composeCustomer(
                identity,
                profile,
              );
            },
          ),
        );

      res
        .status(200)
        .json({
          page:
            result.page,

          pageSize:
            result.pageSize,

          total:
            Number(
              result.total,
            ),

          items,
        });
    },
  ),
);

/*
 * GET /users/customers/:customerId
 */
router.get(
  '/customers/:customerId',

  authenticate,
  requirePermission(
    'CUSTOMER_READ',
  ),

  asyncHandler(
    async (
      req,
      res,
    ) => {
      const customerClient =
        getBusinessClient(
          'customer',
        );

      const authClient =
        getBusinessClient(
          'auth',
        );

      const profile =
        await call(
          customerClient,

          'getCustomerById',

          {
            context:
              buildRequestContext(
                req,
              ),

            customerId:
              req.params
                .customerId,
          },
        );

      const identity =
        await call(
          authClient,

          'getUserIdentity',

          {
            context:
              buildRequestContext(
                req,
              ),

            userId:
              profile.userId,
          },
        );

      res
        .status(200)
        .json(
          composeCustomer(
            identity,
            profile,
          ),
        );
    },
  ),
);

module.exports = router;