'use strict';

const APPLICATION_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

function isApprovalDecision(value) {
  return [
    APPLICATION_STATUS.APPROVED,
    APPLICATION_STATUS.REJECTED,
  ].includes(value);
}

function toDriverApplicationSummary(row) {
  return {
    applicationId:
      String(row.application_id),

    driverId:
      String(row.driver_id),

    ...(row.full_name
      ? { fullName: row.full_name }
      : {}),

    ...(row.vehicle_id
      ? {
          vehicleId:
            String(row.vehicle_id),
        }
      : {}),

    approvalStatus:
      row.status,

    submittedAt:
      new Date(
        row.submitted_at,
      ).toISOString(),
  };
}

module.exports = {
  APPLICATION_STATUS,
  isApprovalDecision,
  toDriverApplicationSummary,
};