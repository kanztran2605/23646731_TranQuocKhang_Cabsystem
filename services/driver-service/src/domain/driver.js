'use strict';

const APPROVAL_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const AVAILABILITY_STATUS = Object.freeze({
  OFFLINE: 'OFFLINE',
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
});

function toIsoDate(value) {
  if (!value) {
    return undefined;
  }

  return new Date(value)
    .toISOString()
    .slice(0, 10);
}

function toDriver(
  row,
  { driverLicense } = {},
) {
  return {
    driverId: String(row.driver_id),
    userId: String(row.user_id),
    fullName: row.full_name,

    ...(driverLicense
      ? { driverLicense }
      : {}),

    approvalStatus:
      row.approval_status,

    availabilityStatus:
      row.availability_status,

    ...(row.address
      ? { address: row.address }
      : {}),

    ...(row.date_of_birth
      ? {
          dateOfBirth:
            toIsoDate(
              row.date_of_birth,
            ),
        }
      : {}),
  };
}

function isEligibleForNewTrip(driver) {
  return (
    driver.approval_status ===
      APPROVAL_STATUS.APPROVED &&
    driver.availability_status ===
      AVAILABILITY_STATUS.AVAILABLE
  );
}

module.exports = {
  APPROVAL_STATUS,
  AVAILABILITY_STATUS,
  toDriver,
  isEligibleForNewTrip,
};