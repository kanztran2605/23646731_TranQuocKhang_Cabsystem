'use strict';

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

function requireRole(
  ...allowedRoles
) {
  const roles =
    new Set(
      allowedRoles
        .flat()
        .filter(Boolean),
    );

  return (
    req,
    _res,
    next,
  ) => {
    if (!req.auth) {
      next(
        AppError.unauthorized(),
      );

      return;
    }

    if (
      !roles.has(
        req.auth.role,
      )
    ) {
      next(
        AppError.forbidden(
          'You do not have permission to perform this action',
          'FORBIDDEN',
        ),
      );

      return;
    }

    next();
  };
}

function requirePermission(
  ...requiredPermissions
) {
  const required =
    requiredPermissions
      .flat()
      .filter(Boolean);

  return (
    req,
    _res,
    next,
  ) => {
    if (!req.auth) {
      next(
        AppError.unauthorized(),
      );

      return;
    }

    const granted =
      new Set(
        req.auth.permissions || [],
      );

    const missing =
      required.filter(
        (permission) =>
          !granted.has(
            permission,
          ),
      );

    if (
      missing.length > 0
    ) {
      next(
        AppError.forbidden(
          'You do not have permission to perform this action',
          'FORBIDDEN',
        ),
      );

      return;
    }

    next();
  };
}

module.exports = {
  requireRole,
  requirePermission,
};