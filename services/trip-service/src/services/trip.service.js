'use strict';
const repository = require('../repositories/trip.repository');
const database = require('../config/database');
const driverClient = require('../grpc/driver.client');
const { publishTrip } = require('../events/trip.publisher');
const { toTrip, toLocation } = require('../domain/trip');
const { toHistory } = require('../domain/trip-status-history');
const { transition, cancellation } = require('./trip-state-machine');
const { id, text, actor, coordinates } = require('../../../../shared/validation');
const { AppError } = require('../../../../shared/errors/app-error');
function createTripService({ repo = repository, transaction = database.withTransaction, publish = publishTrip, driver = driverClient } = {}) {
  function found(row) { if (!row) throw AppError.notFound('Trip does not exist'); return row; }
  function own(context, row, roles = ['CUSTOMER','DRIVER','ADMIN']) {
    const user = actor(context, roles);
    if (context.actorRole === 'ADMIN') return;
    const customer = context.actorRole === 'CUSTOMER';
    if (user !== String(customer ? row.customer_uid : row.driver_uid) ||
        (customer && context.actorCustomerId && id(context.actorCustomerId) !== String(row.cid)) ||
        (!customer && context.actorDriverId && id(context.actorDriverId) !== String(row.did))) throw AppError.forbidden();
  }
  async function emit(type, row, from, correlationId) {
    try { await publish(type,row,from,correlationId); }
    catch (_error) { throw new AppError('Event publisher unavailable',{statusCode:503,code:'EVENT_PUBLISH_FAILED'}); }
  }
  return {
    async assigned(payload, correlationId) {
      for (const field of ['bookingId','customerId','driverId','vehicleId','customerUserId','driverUserId']) id(payload[field]);
      if (!Number.isFinite(Date.parse(payload.acceptedAt))) throw AppError.badRequest('Invalid acceptance timestamp');
      const result = await transaction(async client => {
        const created = await repo.create(payload,client);
        if (created) {
          await repo.history(created.tid,null,'ASSIGNED',payload.acceptedAt,client);
          return { row:created, created:true };
        }
        const existing = found(await repo.byBooking(payload.bookingId,client));
        for (const [column,field] of [['cid','customerId'],['did','driverId'],['vid','vehicleId'],['customer_uid','customerUserId'],['driver_uid','driverUserId']]) {
          if (String(existing[column]) !== String(payload[field])) throw AppError.conflict('Conflicting assignment delivery');
        }
        return { row:existing, created:false };
      });
      if (result.created) await emit('trip.status.changed',result.row,null,correlationId);
      return toTrip(result.row);
    },
    async paymentCompleted(payload) {
      const tripId = id(payload.tripId);
      return transaction(async client => {
        const row = found(await repo.lock(tripId,client));
        if (String(row.bid) !== id(payload.bookingId) || String(row.cid) !== id(payload.customerId) || row.s !== 'COMPLETED' ||
            !payload.recipientUserIds?.includes(String(row.customer_uid))) throw AppError.conflict('Payment does not match completed Trip');
        if (!row.paid) await repo.paid(tripId,client);
      });
    },
    async getTrip(request) {
      actor(request.context,['CUSTOMER','DRIVER','ADMIN']);
      const row = found(await repo.byId(id(request.tripId))); own(request.context,row); return toTrip(row);
    },
    async getTripByBooking(request) {
      actor(request.context,['CUSTOMER','DRIVER','ADMIN']);
      const row = found(await repo.byBooking(id(request.bookingId))); own(request.context,row); return toTrip(row);
    },
    async updateTripStatus(request) {
      actor(request.context,['DRIVER']);
      const result = await transaction(async client => {
        const row = found(await repo.lock(id(request.tripId),client)); own(request.context,row,['DRIVER']);
        transition(row.s,request.status);
        const at = new Date().toISOString();
        const changed = await repo.change(row.tid,request.status,null,at,client);
        await repo.history(row.tid,row.s,changed.s,at,client);
        return { row:changed, from:row.s };
      });
      await emit('trip.status.changed',result.row,result.from,request.context.correlationId);
      if (result.row.s === 'COMPLETED') await emit('trip.completed',result.row,result.from,request.context.correlationId);
      return toTrip(result.row);
    },
    async updateTripLocation(request) {
      actor(request.context,['DRIVER']); coordinates(request.latitude,request.longitude);
      return transaction(async client => {
        const row = found(await repo.lock(id(request.tripId),client)); own(request.context,row,['DRIVER']);
        if (row.s !== 'IN_PROGRESS') throw AppError.conflict('Trip must be in progress');
        await driver.getDriverLocation(String(row.did),request.context.correlationId);
        return toLocation(await repo.location(row.tid,request.latitude,request.longitude,client));
      });
    },
    async cancelTrip(request) {
      actor(request.context,['CUSTOMER']); const reason = text(request.reason,100);
      const result = await transaction(async client => {
        const row = found(await repo.lock(id(request.tripId),client)); own(request.context,row,['CUSTOMER']); cancellation(row.s);
        const at = new Date().toISOString(), changed = await repo.change(row.tid,'CANCELED',reason,at,client);
        await repo.history(row.tid,row.s,'CANCELED',at,client); return { row:changed, from:row.s };
      });
      await emit('trip.canceled',result.row,result.from,request.context.correlationId); return toTrip(result.row);
    },
    async getTripStatusHistory(request) {
      const row = found(await repo.byId(id(request.tripId))); own(request.context,row);
      return { items: (await repo.listHistory(row.tid)).map(toHistory) };
    },
    async validateCompletedTrip(request) {
      const row = found(await repo.byId(id(request.tripId)));
      return { tripId:String(row.tid), bookingId:String(row.bid), customerId:String(row.cid), driverId:String(row.did),
        customerUserId:String(row.customer_uid), driverUserId:String(row.driver_uid), completed:row.s === 'COMPLETED', status:row.s };
    },
  };
}
module.exports = { ...createTripService(), createTripService };
