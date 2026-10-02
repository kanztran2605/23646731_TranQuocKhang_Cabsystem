'use strict';

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

function assertPermission(
  context,
  permission,
) {
  const permissions =
    Array.isArray(
      context?.permissions,
    )
      ? context.permissions
      : [];

  if (
    !permissions.includes(
      permission,
    )
  ) {
    throw AppError.forbidden(
      'You do not have permission to perform this action',
      'FORBIDDEN',
    );
  }
}

module.exports = {
  assertPermission,
};