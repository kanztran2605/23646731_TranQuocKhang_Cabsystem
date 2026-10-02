'use strict';

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

const authService =
  require(
    '../services/auth.service'
  );

function toGrpcError(
  error,
) {
  if (
    error instanceof
    AppError
  ) {
    const statusMap = {
      400:
        grpc.status
          .INVALID_ARGUMENT,

      401:
        grpc.status
          .UNAUTHENTICATED,

      403:
        grpc.status
          .PERMISSION_DENIED,

      404:
        grpc.status
          .NOT_FOUND,

      409:
        grpc.status
          .ALREADY_EXISTS,

      429:
        grpc.status
          .RESOURCE_EXHAUSTED,
    };

    return {
      code:
        statusMap[
          error.statusCode
        ] ||
        grpc.status.INTERNAL,

      details:
        error.message,
    };
  }

  return {
    code:
      grpc.status.INTERNAL,

    details:
      'Internal server error',
  };
}

function unary(
  handler,
) {
  return async (
    call,
    callback,
  ) => {
    try {
      callback(
        null,
        await handler(
          call.request,
        ),
      );
    } catch (error) {
      callback(
        toGrpcError(
          error,
        ),
      );
    }
  };
}

function createAuthGrpcHandlers() {
  return {
    registerCustomerIdentity:
      unary(
        authService
          .registerCustomerIdentity,
      ),

    login:
      unary(
        authService.login,
      ),

    logout:
      unary(
        authService.logout,
      ),

    requestDriverOtp:
      unary(
        authService
          .requestDriverOtp,
      ),

    verifyDriverOtp:
      unary(
        authService
          .verifyDriverOtp,
      ),

    registerDriverIdentity:
      unary(
        authService
          .registerDriverIdentity,
      ),

    refreshAccessToken:
      unary(
        authService
          .refreshAccessToken,
      ),

    getUserIdentity:
      unary(
        authService
          .getUserIdentity,
      ),

    listRoles:
      unary(
        authService
          .listRoles,
      ),

    updateRolePermissions:
      unary(
        authService
          .updateRolePermissions,
      ),
  };
}

module.exports = {
  createAuthGrpcHandlers,
};