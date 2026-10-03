'use strict';

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const {
  withTransaction,
} = require(
  '../config/database'
);

const driverRepository =
  require(
    '../repositories/driver.repository'
  );

const vehicleRepository =
  require(
    '../repositories/vehicle.repository'
  );

const {
  APPROVAL_STATUS,
  AVAILABILITY_STATUS,
  toDriver,
} = require(
  '../domain/driver'
);

const {
  APPLICATION_STATUS,
  isApprovalDecision,
  toDriverApplicationSummary,
} = require(
  '../domain/driver-application'
);

const {
  encryptDriverLicense,
  decryptDriverLicense,
} = require(
  '../domain/driver-profile'
);

const {
  VEHICLE_TYPE_STATUS,
} = require(
  '../domain/vehicle-type'
);

function requireActor(context) {
  if (!context?.actorUserId) {
    throw AppError.unauthorized();
  }
}

function requireDriverRole(context) {
  requireActor(context);

  if (context.actorRole !== 'DRIVER') {
    throw AppError.forbidden(
      'Only Driver can perform this action',
      'FORBIDDEN',
    );
  }
}

function requirePermission(
  context,
  permission,
) {
  requireActor(context);

  const permissions =
    Array.isArray(context.permissions)
      ? context.permissions
      : [];

  if (!permissions.includes(permission)) {
    throw AppError.forbidden(
      'You do not have permission to perform this action',
      'FORBIDDEN',
    );
  }
}

function assertNumericId(
  value,
  fieldName,
) {
  if (!/^\d+$/.test(String(value || ''))) {
    throw AppError.badRequest(
      `${fieldName} is invalid`,
      'INVALID_REQUEST',
    );
  }

  return String(value);
}

function driverResponse(
  row,
  { includeSensitive = false } = {},
) {
  return toDriver(
    row,
    {
      driverLicense:
        includeSensitive
          ? decryptDriverLicense(
              row.driver_license_ciphertext,
            )
          : undefined,
    },
  );
}

async function registerDriverProfile(
  request,
) {
  const userId =
    assertNumericId(
      request.userId,
      'userId',
    );

  const vehicleTypeId =
    assertNumericId(
      request.vehicle?.vehicleTypeId,
      'vehicleTypeId',
    );

  const fullName =
    String(
      request.fullName || '',
    ).trim();

  const driverLicense =
    String(
      request.driverLicense || '',
    ).trim();

  const licensePlate =
    String(
      request.vehicle?.licensePlate || '',
    ).trim();

  if (
    !fullName ||
    !driverLicense ||
    !licensePlate
  ) {
    throw AppError.badRequest(
      'Driver profile and Vehicle data are required',
      'INVALID_REQUEST',
    );
  }

  const encrypted =
    encryptDriverLicense(
      driverLicense,
    );

  try {
    return await withTransaction(
      async (client) => {
        const existing =
          await driverRepository
            .findByUserId(
              userId,
              client,
            );

        if (existing) {
          throw AppError.conflict(
            'Driver profile already exists',
            'DRIVER_ALREADY_EXISTS',
          );
        }

        const vehicleType =
          await vehicleRepository
            .findVehicleTypeById(
              vehicleTypeId,
              client,
            );

        if (
          !vehicleType ||
          vehicleType.status !==
            VEHICLE_TYPE_STATUS.ACTIVE
        ) {
          throw AppError.badRequest(
            'Vehicle type does not exist or is inactive',
            'INVALID_VEHICLE_TYPE',
          );
        }

        const driver =
          await driverRepository
            .createDriver(
              {
                userId,
                approvalStatus:
                  APPROVAL_STATUS
                    .PENDING_APPROVAL,
                availabilityStatus:
                  AVAILABILITY_STATUS
                    .OFFLINE,
              },
              client,
            );

        await driverRepository
          .createProfile(
            {
              driverId:
                driver.driver_id,
              fullName,
              driverLicenseCiphertext:
                encrypted.ciphertext,
              encryptionKeyVersion:
                encrypted.keyVersion,
            },
            client,
          );

        const vehicle =
          await vehicleRepository
            .createVehicle(
              {
                driverId:
                  driver.driver_id,
                vehicleTypeId,
                licensePlate,
                brand:
                  request.vehicle.brand ||
                  null,
                model:
                  request.vehicle.model ||
                  null,
              },
              client,
            );

        await driverRepository
          .createApplication(
            {
              driverId:
                driver.driver_id,
              vehicleId:
                vehicle.vehicle_id,
              status:
                APPLICATION_STATUS
                  .PENDING_APPROVAL,
            },
            client,
          );

        return {
          driverId:
            String(
              driver.driver_id,
            ),
          userId:
            String(
              driver.user_id,
            ),
          approvalStatus:
            driver.approval_status,
          message:
            'Driver profile created and pending approval',
        };
      },
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error.code === '23505') {
      throw AppError.conflict(
        'Driver or license plate already exists',
        'DRIVER_REGISTRATION_CONFLICT',
      );
    }

    throw error;
  }
}

async function getMyDriverProfile(
  request,
) {
  requireDriverRole(
    request.context,
  );

  const row =
    await driverRepository
      .findByUserId(
        request.context
          .actorUserId,
      );

  if (!row) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  return driverResponse(row);
}

async function updateMyDriverProfile(
  request,
) {
  requireDriverRole(
    request.context,
  );

  requirePermission(
    request.context,
    'PROFILE_UPDATE_SELF',
  );

  const current =
    await driverRepository
      .findByUserId(
        request.context
          .actorUserId,
      );

  if (!current) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  const patch = {};

  if (request.fullName) {
    patch.fullName =
      request.fullName.trim();
  }

  if (
    Object.prototype.hasOwnProperty.call(
      request,
      'address',
    )
  ) {
    patch.address =
      request.address.trim();
  }

  if (request.dateOfBirth) {
    patch.dateOfBirth =
      request.dateOfBirth;
  }

  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest(
      'At least one Driver profile field is required',
      'INVALID_REQUEST',
    );
  }

  const updated =
    await driverRepository
      .updateProfile(
        current.driver_id,
        patch,
      );

  return driverResponse(updated);
}

async function getDriverById(
  request,
) {
  requireActor(
    request.context,
  );

  const driverId =
    assertNumericId(
      request.driverId,
      'driverId',
    );

  const row =
    await driverRepository
      .findByDriverId(
        driverId,
      );

  if (!row) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  const vehicle =
    await vehicleRepository
      .findActiveByDriverId(
        driverId,
      );

  return {
    driverId:
      String(row.driver_id),
    fullName:
      row.full_name,
    availabilityStatus:
      row.availability_status,
    ...(vehicle
      ? {
          vehicle: {
            vehicleTypeId:
              String(
                vehicle.vehicle_type_id,
              ),
            ...(vehicle.brand
              ? { brand: vehicle.brand }
              : {}),
            ...(vehicle.model
              ? { model: vehicle.model }
              : {}),
            licensePlate:
              vehicle.license_plate,
          },
        }
      : {}),
  };
}

async function updateDriver(
  request,
) {
  requirePermission(
    request.context,
    'DRIVER_MANAGE',
  );

  const driverId =
    assertNumericId(
      request.driverId,
      'driverId',
    );

  const current =
    await driverRepository
      .findByDriverId(
        driverId,
      );

  if (!current) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  const patch = {};

  if (request.fullName) {
    patch.fullName =
      request.fullName.trim();
  }

  if (
    Object.prototype.hasOwnProperty.call(
      request,
      'address',
    )
  ) {
    patch.address =
      request.address.trim();
  }

  if (request.dateOfBirth) {
    patch.dateOfBirth =
      request.dateOfBirth;
  }

  if (request.driverLicense) {
    const encrypted =
      encryptDriverLicense(
        request.driverLicense,
      );

    patch.driverLicenseCiphertext =
      encrypted.ciphertext;
    patch.encryptionKeyVersion =
      encrypted.keyVersion;
  }

  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest(
      'At least one Driver profile field is required',
      'INVALID_REQUEST',
    );
  }

  const updated =
    await driverRepository
      .updateProfile(
        driverId,
        patch,
      );

  return driverResponse(
    updated,
    { includeSensitive: true },
  );
}

async function listDrivers(
  request,
) {
  requirePermission(
    request.context,
    'DRIVER_MANAGE',
  );

  const page =
    Number(request.page || 1);
  const limit =
    Number(request.limit || 20);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw AppError.badRequest(
      'Invalid pagination parameters',
      'INVALID_REQUEST',
    );
  }

  if (
    request.vehicleTypeId
  ) {
    assertNumericId(
      request.vehicleTypeId,
      'vehicleTypeId',
    );
  }

  const rows =
    await driverRepository
      .listDrivers({
        approvalStatus:
          request.approvalStatus ||
          null,
        availabilityStatus:
          request.availabilityStatus ||
          null,
        vehicleTypeId:
          request.vehicleTypeId ||
          null,
        page,
        limit,
      });

  return {
    items:
      rows.map(
        (row) =>
          driverResponse(
            row,
            { includeSensitive: true },
          ),
      ),
  };
}

async function updateMyAvailability(
  request,
) {
  requireDriverRole(
    request.context,
  );

  requirePermission(
    request.context,
    'DRIVER_AVAILABILITY_UPDATE_SELF',
  );

  const current =
    await driverRepository
      .findByUserId(
        request.context
          .actorUserId,
      );

  if (!current) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  const online =
    Boolean(request.online);

  if (
    online &&
    current.approval_status !==
      APPROVAL_STATUS.APPROVED
  ) {
    throw AppError.conflict(
      'Driver must be APPROVED before becoming AVAILABLE',
      'DRIVER_NOT_APPROVED',
    );
  }

  if (
    current.availability_status ===
      AVAILABILITY_STATUS.BUSY
  ) {
    throw AppError.conflict(
      'BUSY Driver cannot change availability manually',
      'DRIVER_BUSY',
    );
  }

  const nextStatus =
    online
      ? AVAILABILITY_STATUS.AVAILABLE
      : AVAILABILITY_STATUS.OFFLINE;

  const updated =
    await driverRepository
      .setAvailabilityByUserId(
        current.user_id,
        nextStatus,
      );

  return driverResponse(updated);
}

async function getPendingDriverApplications(
  request,
) {
  requirePermission(
    request.context,
    'DRIVER_APPROVE',
  );

  const page =
    Number(request.page || 1);
  const limit =
    Number(request.limit || 20);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw AppError.badRequest(
      'Invalid pagination parameters',
      'INVALID_REQUEST',
    );
  }

  const result =
    await driverRepository
      .listPendingApplications({
        page,
        limit,
      });

  return {
    page,
    limit,
    total: result.total,
    items:
      result.rows.map(
        toDriverApplicationSummary,
      ),
  };
}

async function approveOrRejectDriver(
  request,
) {
  requirePermission(
    request.context,
    'DRIVER_APPROVE',
  );

  const driverId =
    assertNumericId(
      request.driverId,
      'driverId',
    );

  const decision =
    request.decision;

  if (!isApprovalDecision(decision)) {
    throw AppError.badRequest(
      'decision must be APPROVED or REJECTED',
      'INVALID_APPROVAL_DECISION',
    );
  }

  const reason =
    String(request.reason || '')
      .trim();

  if (
    decision ===
      APPLICATION_STATUS.REJECTED &&
    !reason
  ) {
    throw AppError.badRequest(
      'reason is required when rejecting a Driver',
      'REJECTION_REASON_REQUIRED',
    );
  }

  if (reason.length > 255) {
    throw AppError.badRequest(
      'reason must not exceed 255 characters',
      'INVALID_REQUEST',
    );
  }

  return withTransaction(
    async (client) => {
      const driver =
        await driverRepository
          .lockByDriverId(
            driverId,
            client,
          );

      if (!driver) {
        throw AppError.notFound(
          'Driver does not exist',
          'DRIVER_NOT_FOUND',
        );
      }

      if (
        driver.approval_status !==
        APPROVAL_STATUS
          .PENDING_APPROVAL
      ) {
        throw AppError.conflict(
          'Only PENDING_APPROVAL Driver can be reviewed',
          'INVALID_APPROVAL_STATE',
        );
      }

      const application =
        await driverRepository
          .lockPendingApplication(
            driverId,
            client,
          );

      if (!application) {
        throw AppError.conflict(
          'Pending Driver Application does not exist',
          'PENDING_APPLICATION_NOT_FOUND',
        );
      }

      await driverRepository
        .setApprovalStatus(
          driverId,
          decision,
          client,
        );

      const reviewed =
        await driverRepository
          .reviewApplication(
            {
              applicationId:
                application.application_id,
              decision,
              reviewedByUserId:
                request.context
                  .actorUserId,
              rejectionReason:
                decision ===
                APPLICATION_STATUS.REJECTED
                  ? reason
                  : null,
            },
            client,
          );

      return {
        driverId,
        approvalStatus:
          decision,
        updatedAt:
          new Date(
            reviewed.reviewed_at,
          ).toISOString(),
      };
    },
  );
}

async function getDriverByUserId(
  request,
) {
  const userId =
    assertNumericId(
      request.userId,
      'userId',
    );

  const row =
    await driverRepository
      .findByUserId(userId);

  if (!row) {
    throw AppError.notFound(
      'Driver does not exist',
      'DRIVER_NOT_FOUND',
    );
  }

  return driverResponse(row);
}

async function markBusyFromAssignment(
  driverId,
) {
  assertNumericId(
    driverId,
    'driverId',
  );

  await driverRepository
    .setBusyFromAssignment(
      driverId,
    );
}

async function releaseAfterTrip(
  driverId,
) {
  assertNumericId(
    driverId,
    'driverId',
  );

  await driverRepository
    .releaseBusyDriver(
      driverId,
    );
}

module.exports = {
  registerDriverProfile,
  getMyDriverProfile,
  updateMyDriverProfile,
  getDriverById,
  updateDriver,
  listDrivers,
  updateMyAvailability,
  getPendingDriverApplications,
  approveOrRejectDriver,
  getDriverByUserId,
  markBusyFromAssignment,
  releaseAfterTrip,
};