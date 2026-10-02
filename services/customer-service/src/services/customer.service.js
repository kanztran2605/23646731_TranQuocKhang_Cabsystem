'use strict';

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const customerRepository =
  require(
    '../repositories/customer.repository'
  );

const {
  toCustomerProfile,
} = require(
  '../domain/customer-profile'
);

function requireActor(
  context,
) {
  if (
    !context?.actorUserId
  ) {
    throw AppError
      .unauthorized();
  }
}

function requireCustomerRole(
  context,
) {
  requireActor(
    context,
  );

  if (
    context.actorRole !==
    'CUSTOMER'
  ) {
    throw AppError.forbidden(
      'Current profile is not owned by customer-service',
      'FORBIDDEN',
    );
  }
}

function requirePermission(
  context,
  permission,
) {
  requireActor(
    context,
  );

  const permissions =
    Array.isArray(
      context.permissions,
    )
      ? context.permissions
      : [];

  if (
    !permissions.includes(
      permission,
    )
  ) {
    throw AppError.forbidden(
      'You do not have permission to access Customer information',
      'FORBIDDEN',
    );
  }
}

function assertNumericId(
  value,
  fieldName,
) {
  if (
    !/^\d+$/.test(
      String(
        value || '',
      ),
    )
  ) {
    throw AppError.badRequest(
      `${fieldName} is invalid`,
      'INVALID_REQUEST',
    );
  }
}

async function createCustomerProfile(
  request,
) {
  if (
    !request.userId ||
    !request.fullName?.trim()
  ) {
    throw AppError.badRequest(
      'userId and fullName are required',
      'INVALID_REQUEST',
    );
  }

  try {
    const row =
      await customerRepository
        .createProfile({
          userId:
            request.userId,

          fullName:
            request.fullName
              .trim(),
        });

    return toCustomerProfile(
      row,
    );
  } catch (error) {
    if (
      error.code ===
      '23505'
    ) {
      throw AppError.conflict(
        'Customer profile already exists',
        'CUSTOMER_ALREADY_EXISTS',
      );
    }

    throw error;
  }
}

async function getMyProfile(
  request,
) {
  requireCustomerRole(
    request.context,
  );

  const row =
    await customerRepository
      .findByUserId(
        request.context
          .actorUserId,
      );

  if (!row) {
    throw AppError.notFound(
      'Customer profile does not exist',
      'CUSTOMER_NOT_FOUND',
    );
  }

  return toCustomerProfile(
    row,
  );
}

async function updateMyProfile(
  request,
) {
  requireCustomerRole(
    request.context,
  );

  const patch = {};

  if (
    Object.prototype
      .hasOwnProperty.call(
        request,
        'fullName',
      )
  ) {
    patch.fullName =
      request.fullName.trim();
  }

  if (
    Object.prototype
      .hasOwnProperty.call(
        request,
        'address',
      )
  ) {
    patch.address =
      request.address.trim();
  }

  if (
    Object.prototype
      .hasOwnProperty.call(
        request,
        'dateOfBirth',
      )
  ) {
    patch.dateOfBirth =
      request.dateOfBirth;
  }

  if (
    Object.keys(patch)
      .length === 0
  ) {
    throw AppError.badRequest(
      'At least one profile field is required',
      'INVALID_REQUEST',
    );
  }

  const row =
    await customerRepository
      .updateByUserId(
        request.context
          .actorUserId,
        patch,
      );

  if (!row) {
    throw AppError.notFound(
      'Customer profile does not exist',
      'CUSTOMER_NOT_FOUND',
    );
  }

  return toCustomerProfile(
    row,
  );
}

async function listCustomers(
  request,
) {
  requirePermission(
    request.context,
    'CUSTOMER_READ',
  );

  const page =
    Number(
      request.page || 1,
    );

  const pageSize =
    Number(
      request.pageSize ||
      20,
    );

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw AppError.badRequest(
      'Invalid pagination parameters',
      'INVALID_REQUEST',
    );
  }

  const result =
    await customerRepository
      .listCustomers({
        keyword:
          request.keyword ||
          null,

        page,
        pageSize,
      });

  return {
    page:
      result.page,

    pageSize:
      result.pageSize,

    total:
      result.total,

    items:
      result.items.map(
        toCustomerProfile,
      ),
  };
}

async function getCustomerById(
  request,
) {
  requirePermission(
    request.context,
    'CUSTOMER_READ',
  );

  assertNumericId(
    request.customerId,
    'customerId',
  );

  const row =
    await customerRepository
      .findByCustomerId(
        request.customerId,
      );

  if (!row) {
    throw AppError.notFound(
      'Customer does not exist',
      'CUSTOMER_NOT_FOUND',
    );
  }

  return toCustomerProfile(
    row,
  );
}

/*
 * Internal synchronous contract.
 * Used later by booking-service.
 */
async function getCustomerByUserId(
  request,
) {
  assertNumericId(
    request.userId,
    'userId',
  );

  const row =
    await customerRepository
      .findByUserId(
        request.userId,
      );

  if (!row) {
    throw AppError.notFound(
      'Customer profile does not exist',
      'CUSTOMER_NOT_FOUND',
    );
  }

  return toCustomerProfile(
    row,
  );
}

module.exports = {
  createCustomerProfile,
  getMyProfile,
  updateMyProfile,
  listCustomers,
  getCustomerById,
  getCustomerByUserId,
};