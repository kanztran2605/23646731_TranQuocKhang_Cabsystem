'use strict';

const {
  randomInt,
} = require(
  'node:crypto'
);

const bcrypt =
  require('bcryptjs');

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const userRepository =
  require(
    '../repositories/user.repository'
  );

const otpRepository =
  require(
    '../repositories/otp.repository'
  );

const {
  OTP_PURPOSE,
  isExpired,
} = require(
  '../domain/otp-verification'
);

const {
  issueDriverVerificationToken,
} = require(
  './token.service'
);

const OTP_TTL_SECONDS =
  Number(
    process.env
      .OTP_TTL_SECONDS ||
      300,
  );

const OTP_MAX_ATTEMPTS =
  Number(
    process.env
      .OTP_MAX_ATTEMPTS ||
      5,
  );

const BCRYPT_ROUNDS =
  Number(
    process.env
      .BCRYPT_ROUNDS ||
      12,
  );

const MOCK_ENABLED =
  String(
    process.env
      .AUTH_MOCK_OTP_ENABLED ||
      'false',
  ) === 'true';

const MOCK_CODE =
  String(
    process.env
      .AUTH_MOCK_OTP_CODE ||
      '123456',
  );

async function requestDriverOtp({
  phone,
}) {
  const existingUser =
    await userRepository
      .findByIdentifier(
        phone,
      );

  if (existingUser) {
    throw AppError.conflict(
      'Phone number already belongs to an existing account',
      'ACCOUNT_ALREADY_EXISTS',
    );
  }

  const otp =
    MOCK_ENABLED
      ? MOCK_CODE
      : String(
          randomInt(
            100000,
            1000000,
          ),
        );

  const otpHash =
    await bcrypt.hash(
      otp,
      BCRYPT_ROUNDS,
    );

  const expiresAt =
    new Date(
      Date.now() +
        OTP_TTL_SECONDS *
          1000,
    );

  const verification =
    await otpRepository.create({
      phone,
      otpHash,
      purpose:
        OTP_PURPOSE,
      expiresAt,
    });

  return {
    verificationId:
      verification.otp_id,

    expiresIn:
      OTP_TTL_SECONDS,

    message:
      'OTP has been sent',

    ...(MOCK_ENABLED
      ? {
          devOtp: otp,
        }
      : {}),
  };
}

async function verifyDriverOtp({
  verificationId,
  otp,
}) {
  if (
    !/^\d+$/.test(
      String(
        verificationId ||
          '',
      ),
    )
  ) {
    throw AppError.badRequest(
      'Invalid verificationId',
      'INVALID_OTP_VERIFICATION',
    );
  }

  const record =
    await otpRepository
      .findById(
        verificationId,
      );

  if (
    !record ||
    record.purpose !==
      OTP_PURPOSE
  ) {
    throw AppError.badRequest(
      'OTP verification does not exist',
      'INVALID_OTP_VERIFICATION',
    );
  }

  if (
    record.verified_at
  ) {
    throw AppError.conflict(
      'OTP was already verified',
      'OTP_ALREADY_VERIFIED',
    );
  }

  if (
    isExpired(
      record.expires_at,
    )
  ) {
    throw AppError.badRequest(
      'OTP has expired',
      'OTP_EXPIRED',
    );
  }

  if (
    record.attempt_count >=
    OTP_MAX_ATTEMPTS
  ) {
    throw AppError.badRequest(
      'OTP attempt limit exceeded',
      'OTP_ATTEMPT_LIMIT',
    );
  }

  const valid =
    await bcrypt.compare(
      String(otp),
      record.otp_hash,
    );

  if (!valid) {
    await otpRepository
      .incrementAttempt(
        record.otp_id,
      );

    throw AppError.badRequest(
      'OTP is invalid',
      'INVALID_OTP',
    );
  }

  await otpRepository
    .markVerified(
      record.otp_id,
    );

  return {
    verificationToken:
      issueDriverVerificationToken({
        phone:
          record.phone,

        otpId:
          record.otp_id,
      }),

    verified: true,
  };
}

module.exports = {
  requestDriverOtp,
  verifyDriverOtp,
};