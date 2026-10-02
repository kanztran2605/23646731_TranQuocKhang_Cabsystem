'use strict';

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

const refreshTokenRepository =
  require(
    '../repositories/refresh-token.repository'
  );

const otpService =
  require(
    './otp.service'
  );

const {
  ROLES,
  normalizeEmail,
  toUserIdentity,
} = require(
  '../domain/user'
);

const {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  issueAccessToken,
  createRefreshTokenPair,
  hashRefreshToken,
  verifyDriverVerificationToken,
} = require(
  './token.service'
);

const {
  assertPermission,
} = require(
  '../middleware/authorization.middleware'
);

const BCRYPT_ROUNDS =
  Number(
    process.env
      .BCRYPT_ROUNDS ||
      12,
  );

async function createIdentity({
  phone,
  email,
  password,
  roleName,
}) {
  const normalizedEmail =
    normalizeEmail(email);

  const duplicate =
    await userRepository
      .findDuplicate(
        phone,
        normalizedEmail,
      );

  if (duplicate) {
    throw AppError.conflict(
      'Phone or email already belongs to an existing account',
      'ACCOUNT_ALREADY_EXISTS',
    );
  }

  const passwordHash =
    await bcrypt.hash(
      password,
      BCRYPT_ROUNDS,
    );

  try {
    const user =
      await userRepository
        .createUser({
          phone,
          email:
            normalizedEmail,
          passwordHash,
          roleName,
        });

    return toUserIdentity(
      user,
    );
  } catch (error) {
    if (
      error.code ===
      '23505'
    ) {
      throw AppError.conflict(
        'Phone or email already belongs to an existing account',
        'ACCOUNT_ALREADY_EXISTS',
      );
    }

    throw error;
  }
}

async function registerCustomerIdentity(
  request,
) {
  return createIdentity({
    phone:
      request.phone,

    email:
      request.email,

    password:
      request.password,

    roleName:
      ROLES.CUSTOMER,
  });
}

async function registerDriverIdentity(
  request,
) {
  verifyDriverVerificationToken(
    request.verificationToken,
    request.phone,
  );

  return createIdentity({
    phone:
      request.phone,

    email:
      request.email,

    password:
      request.password,

    roleName:
      ROLES.DRIVER,
  });
}

async function login(
  request,
) {
  const user =
    await userRepository
      .findByIdentifier(
        request.identifier,
      );

  if (
    !user ||
    user.status !==
      'ACTIVE'
  ) {
    throw AppError.unauthorized(
      'Invalid credentials',
      'INVALID_CREDENTIALS',
    );
  }

  const validPassword =
    await bcrypt.compare(
      request.password,
      user.password_hash,
    );

  if (!validPassword) {
    throw AppError.unauthorized(
      'Invalid credentials',
      'INVALID_CREDENTIALS',
    );
  }

  const permissions =
    await userRepository
      .getPermissionsForUser(
        user.user_id,
      );

  const accessToken =
    issueAccessToken({
      userId:
        user.user_id,

      role:
        user.role_name,

      permissions,
    });

  const refresh =
    createRefreshTokenPair();

  await refreshTokenRepository
    .create({
      userId:
        user.user_id,

      tokenHash:
        refresh.tokenHash,

      expiresAt:
        refresh.expiresAt,

      deviceInfo:
        'grpc-api-gateway',
    });

  return {
    accessToken,

    refreshToken:
      refresh.rawToken,

    tokenType:
      'Bearer',

    expiresIn:
      ACCESS_TTL_SECONDS,

    refreshExpiresIn:
      REFRESH_TTL_SECONDS,

    user:
      toUserIdentity(
        user,
      ),
  };
}

async function logout(
  request,
) {
  const userId =
    request.context
      ?.actorUserId;

  if (!userId) {
    throw AppError
      .unauthorized();
  }

  if (
    request.refreshToken
  ) {
    await refreshTokenRepository
      .revokeByHash(
        hashRefreshToken(
          request.refreshToken,
        ),
        userId,
      );
  } else {
    await refreshTokenRepository
      .revokeAllForUser(
        userId,
      );
  }

  return {};
}

async function refreshAccessToken(
  request,
) {
  const rawToken =
    request.refreshToken;

  const current =
    await refreshTokenRepository
      .findActiveByHash(
        hashRefreshToken(
          rawToken,
        ),
      );

  if (
    !current ||
    current.status !==
      'ACTIVE'
  ) {
    throw AppError.unauthorized(
      'Refresh token is invalid, expired, or revoked',
      'INVALID_REFRESH_TOKEN',
    );
  }

  const permissions =
    await userRepository
      .getPermissionsForUser(
        current.user_id,
      );

  const newRefresh =
    createRefreshTokenPair();

  await refreshTokenRepository
    .revokeByHash(
      current.token_hash,
      current.user_id,
    );

  await refreshTokenRepository
    .create({
      userId:
        current.user_id,

      tokenHash:
        newRefresh.tokenHash,

      expiresAt:
        newRefresh.expiresAt,

      deviceInfo:
        'grpc-api-gateway',
    });

  return {
    accessToken:
      issueAccessToken({
        userId:
          current.user_id,

        role:
          current.role_name,

        permissions,
      }),

    refreshToken:
      newRefresh.rawToken,

    tokenType:
      'Bearer',

    expiresIn:
      ACCESS_TTL_SECONDS,

    refreshExpiresIn:
      REFRESH_TTL_SECONDS,

    user:
      toUserIdentity(
        current,
      ),
  };
}

async function getUserIdentity(
  request,
) {
  const user =
    await userRepository
      .findById(
        request.userId,
      );

  if (!user) {
    throw AppError.notFound(
      'User does not exist',
      'USER_NOT_FOUND',
    );
  }

  return toUserIdentity(
    user,
  );
}

async function listRoles(
  request,
) {
  assertPermission(
    request.context,
    'ROLE_MANAGE',
  );

  const roles =
    await userRepository
      .listRoles();

  return {
    items:
      roles.map(
        (role) => ({
          roleId:
            role.role_id,

          name:
            role.role_name,

          permissions:
            role.permissions ||
            [],
        }),
      ),
  };
}

async function updateRolePermissions(
  request,
) {
  assertPermission(
    request.context,
    'ROLE_MANAGE',
  );

  try {
    const role =
      await userRepository
        .replaceRolePermissions(
          request.roleId,
          request.permissions ||
            [],
        );

    if (!role) {
      throw AppError.notFound(
        'Role does not exist',
        'ROLE_NOT_FOUND',
      );
    }

    return {
      roleId:
        role.role_id,

      name:
        role.role_name,

      permissions:
        role.permissions ||
        [],
    };
  } catch (error) {
    if (
      error.code ===
      'INVALID_PERMISSION'
    ) {
      throw AppError.badRequest(
        error.message,
        'INVALID_PERMISSION',
      );
    }

    throw error;
  }
}

module.exports = {
  registerCustomerIdentity,
  registerDriverIdentity,
  login,
  logout,
  refreshAccessToken,
  getUserIdentity,
  listRoles,
  updateRolePermissions,

  requestDriverOtp:
    otpService
      .requestDriverOtp,

  verifyDriverOtp:
    otpService
      .verifyDriverOtp,
};