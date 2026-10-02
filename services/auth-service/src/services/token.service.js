'use strict';

const jwt =
  require('jsonwebtoken');

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const {
  createRawRefreshToken,
  hashRefreshToken,
} = require(
  '../domain/refresh-token'
);

const JWT_SECRET =
  process.env.JWT_SECRET;

const ACCESS_TTL_SECONDS =
  Number(
    process.env
      .JWT_ACCESS_TTL_SECONDS ||
      3600,
  );

const REFRESH_TTL_SECONDS =
  Number(
    process.env
      .JWT_REFRESH_TTL_SECONDS ||
      604800,
  );

const OTP_VERIFICATION_TTL_SECONDS =
  Number(
    process.env
      .OTP_VERIFICATION_TTL_SECONDS ||
      600,
  );

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is required',
  );
}

function issueAccessToken({
  userId,
  role,
  permissions,
}) {
  return jwt.sign(
    {
      role,
      permissions,
    },

    JWT_SECRET,

    {
      algorithm: 'HS256',

      subject:
        String(userId),

      expiresIn:
        ACCESS_TTL_SECONDS,
    },
  );
}

function createRefreshTokenPair() {
  const rawToken =
    createRawRefreshToken();

  return {
    rawToken,

    tokenHash:
      hashRefreshToken(
        rawToken,
      ),

    expiresAt:
      new Date(
        Date.now() +
          REFRESH_TTL_SECONDS *
            1000,
      ),
  };
}

function issueDriverVerificationToken({
  phone,
  otpId,
}) {
  return jwt.sign(
    {
      type:
        'driver-otp-verification',

      phone,

      otpId:
        String(otpId),
    },

    JWT_SECRET,

    {
      algorithm: 'HS256',

      expiresIn:
        OTP_VERIFICATION_TTL_SECONDS,
    },
  );
}

function verifyDriverVerificationToken(
  token,
  expectedPhone,
) {
  try {
    const payload =
      jwt.verify(
        token,
        JWT_SECRET,
        {
          algorithms: [
            'HS256',
          ],
        },
      );

    if (
      payload?.type !==
        'driver-otp-verification' ||
      payload?.phone !==
        expectedPhone
    ) {
      throw new Error(
        'Verification token does not match Driver phone',
      );
    }

    return payload;
  } catch (_error) {
    throw AppError.badRequest(
      'Driver verification token is invalid or expired',
      'INVALID_VERIFICATION_TOKEN',
    );
  }
}

module.exports = {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  issueAccessToken,
  createRefreshTokenPair,
  hashRefreshToken,
  issueDriverVerificationToken,
  verifyDriverVerificationToken,
};