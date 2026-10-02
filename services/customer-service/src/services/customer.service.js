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

async function getCustomerByUserId(
  request,
) {
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
  getCustomerByUserId,
};