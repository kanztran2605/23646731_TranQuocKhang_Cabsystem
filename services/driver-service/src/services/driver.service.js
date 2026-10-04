'use strict';
const repository = require('../repositories/driver.repository');
const { publishEvent } = require('../../../../shared/rabbitmq/publisher');
const { AppError } = require('../../../../shared/errors/app-error');
const { id, text, actor, coordinates, paging } = require('../../../../shared/validation');
const { toDriver, toLocation } = require('../domain/driver');
const { encryptLicense } = require('../security/license');
function vehicleType(value) {
  const result = text(value,50);
  if (/^\d+$/.test(result)) throw AppError.badRequest('Vehicle type must be a string category');
  return result;
}
function radius(value = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw AppError.badRequest('Invalid radius');
  return value;
}
function createDriverService(repo = repository, publish = publishEvent) {
  function found(row) { if (!row) throw AppError.notFound('Driver does not exist'); return row; }
  async function own(context) {
    const userId = actor(context,['DRIVER']);
    const row = found(await repo.findByUserId(userId));
    if (context.actorDriverId && id(context.actorDriverId) !== String(row.did)) throw AppError.forbidden();
    return row;
  }
  return {
    async requestOtp(request) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(request.email,100))) throw AppError.badRequest();
      return { otp: process.env.OTP_MOCK_CODE || '123' };
    },
    async registerDriver(request) {
      const userId = id(request.userId);
      if (actor(request.context,['DRIVER']) !== userId) throw AppError.forbidden();
      if (request.otp !== (process.env.OTP_MOCK_CODE || '123')) throw AppError.badRequest('Invalid OTP');
      const license = text(request.driverLicense,100,true);
      if (license !== undefined && Buffer.byteLength(license, 'utf8') > 156) throw AppError.badRequest('Driver license is too long');
      const input = { userId,name: text(request.name,100),vehicleType: vehicleType(request.vehicleType),
        licensePlate: text(request.licensePlate,20),brand: text(request.brand,50,true),model: text(request.model,50,true),
        ...(license !== undefined ? { encryptedLicense: encryptLicense(license) } : {}) };
      try { return toDriver(await repo.register(input)); }
      catch (error) { if (error.code === '23505') throw AppError.conflict('Driver or plate already exists','ALREADY_EXISTS'); throw error; }
    },
    async getDriver(request) {
      actor(request.context,['ADMIN']);
      return toDriver(found(await repo.findById(id(request.driverId))));
    },
    async getDriverByUserId(request) { return toDriver(found(await repo.findByUserId(id(request.userId)))); },
    async listPendingDrivers(request) {
      actor(request.context,['ADMIN']);
      const page = paging(request.page || 1,request.limit || 5);
      const result = await repo.pending(page);
      return { page: page.page,limit: page.limit,total: result.total,items: result.rows.map(toDriver) };
    },
    async reviewDriverApproval(request) {
      const reviewerUserId = actor(request.context,['ADMIN']);
      const driverId = id(request.driverId);
      if (!['APPROVED','REJECTED'].includes(request.approvalStatus)) throw AppError.badRequest();
      found(await repo.findById(driverId));
      const changed = await repo.approve({ driverId,approvalStatus: request.approvalStatus,reviewerUserId });
      if (!changed) throw AppError.conflict('Driver is no longer pending approval');
      await publish({ producer: 'driver-service',eventType: 'driver.approval.changed',
        correlationId: request.context.correlationId,
        payload: { driverId,userId: String(changed.driver.uid),recipientUserIds: [String(changed.driver.uid)],
          approvalStatus: request.approvalStatus,changedAt: new Date(changed.changedAt).toISOString() } });
      return toDriver(changed.driver);
    },
    async setAvailability(request) {
      if (typeof request.online !== 'boolean') throw AppError.badRequest();
      const row = await own(request.context);
      const changed = await repo.availability({ driverId: String(row.did),online: request.online });
      if (!changed) throw AppError.conflict('Driver must be approved and cannot change availability while busy');
      return toDriver(changed);
    },
    async markBusyForAssignment(request) {
      const userId = actor(request.context,['DRIVER']);
      const driverId = id(request.driverId);
      const row = found(await repo.findById(driverId));
      if (String(row.uid) !== userId || (request.context.actorDriverId && id(request.context.actorDriverId) !== driverId)) throw AppError.forbidden();
      const changed = await repo.markBusy(driverId);
      if (!changed) throw AppError.conflict('Driver must be approved and available');
      return toDriver(changed);
    },
    async updateLocation(request) {
      coordinates(request.latitude,request.longitude);
      const row = await own(request.context);
      return toLocation(await repo.updateLocation({ driverId: String(row.did),latitude: request.latitude,longitude: request.longitude }));
    },
    async getDriverLocation(request) {
      const driverId = id(request.driverId);
      found(await repo.findById(driverId));
      const row = await repo.location(driverId);
      if (!row) throw AppError.notFound('Driver location does not exist');
      return toLocation(row);
    },
    async getNearbyDrivers(request) {
      actor(request.context,['ADMIN']);
      coordinates(request.latitude,request.longitude);
      const page = paging(request.page || 1,request.limit || 5);
      const result = await repo.nearby({ ...page,latitude: request.latitude,longitude: request.longitude,radiusKm: radius(request.radiusKm || 1) });
      return { page: page.page,limit: page.limit,total: result.total,items: result.rows.map(toDriver) };
    },
    async findEligibleDrivers(request) {
      coordinates(request.pickupLatitude,request.pickupLongitude);
      const limit = request.limit || Number(process.env.BOOKING_MATCH_CANDIDATE_LIMIT || 20);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw AppError.badRequest();
      const rows = await repo.eligible({ pickupLatitude: request.pickupLatitude,pickupLongitude: request.pickupLongitude,
        radiusKm: radius(request.radiusKm || 1),vehicleType: vehicleType(request.vehicleType),limit });
      return { items: rows.map((row) => ({ driverId: String(row.did),userId: String(row.uid),vehicleId: String(row.vid),vehicleType: row.vt,
        latitude: Number(row.lat),longitude: Number(row.lng),distanceKm: Number(row.distance_km) })) };
    },
    async listVehicleTypes(request) {
      actor(request.context,['CUSTOMER','DRIVER','ADMIN']);
      return { items: [{ vehicleType: 'CAR',name: 'Car' }] };
    },
    async releaseAfterTrip(driverId,terminalAt) {
      id(driverId);
      if (typeof terminalAt !== 'string' || !Number.isFinite(Date.parse(terminalAt))) throw AppError.badRequest('Invalid terminal timestamp');
      await repo.releaseAfterTrip(driverId,terminalAt);
    },
  };
}
module.exports = { ...createDriverService(),createDriverService };
