'use strict';

const jwt =
  require('jsonwebtoken');

const env =
  require('../config/env');

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

function authenticate(
  req,
  _res,
  next,
) {
  const authorization =
    req.get(
      'authorization',
    );

  if (
    !authorization?.startsWith(
      'Bearer ',
    )
  ) {
    next(
      AppError.unauthorized(
        'Missing access token',
        'UNAUTHORIZED',
      ),
    );

    return;
  }

  const token =
    authorization
      .slice(
        'Bearer '.length,
      )
      .trim();

  if (!token) {
    next(
      AppError.unauthorized(
        'Missing access token',
        'UNAUTHORIZED',
      ),
    );

    return;
  }

  try {
    const payload =
      jwt.verify(
        token,
        env.JWT_SECRET,
        {
          algorithms: [
            'HS256',
          ],
        },
      );

    if (
      !payload ||
      typeof payload !==
        'object' ||
      typeof payload.sub !==
        'string' ||
      typeof payload.role !==
        'string'
    ) {
      throw new Error(
        'JWT payload is missing required claims',
      );
    }

    req.auth = {
      userId:
        payload.sub,

      role:
        payload.role,

      customerId:
        typeof payload.customerId ===
        'string'
          ? payload.customerId
          : undefined,

      driverId:
        typeof payload.driverId ===
        'string'
          ? payload.driverId
          : undefined,

      permissions:
        Array.isArray(
          payload.permissions,
        )
          ? payload.permissions.filter(
              (permission) =>
                typeof permission ===
                'string',
            )
          : [],
    };

    next();
  } catch (_error) {
    next(
      AppError.unauthorized(
        'Invalid or tampered access token',
        'UNAUTHORIZED',
      ),
    );
  }
}

module.exports = {
  authenticate,
};