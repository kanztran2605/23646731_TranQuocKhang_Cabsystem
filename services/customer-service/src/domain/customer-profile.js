'use strict';

function toCustomerProfile(
  row,
) {
  return {
    customerId:
      String(
        row.customer_id,
      ),

    userId:
      String(
        row.user_id,
      ),

    fullName:
      row.full_name,

    ...(row.address
      ? {
          address:
            row.address,
        }
      : {}),

    ...(row.date_of_birth
      ? {
          dateOfBirth:
            new Date(
              row.date_of_birth,
            )
              .toISOString()
              .slice(0, 10),
        }
      : {}),
  };
}

module.exports = {
  toCustomerProfile,
};