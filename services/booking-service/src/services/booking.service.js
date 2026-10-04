'use strict';
const repository = require('../repositories/booking.repository');
const customerClient = require('../grpc/customer.client');
const driverClient = require('../grpc/driver.client');
const publisher = require('../events/booking.publisher');
const database = require('../config/database');
const { createMatchingService } = require('./driver-matching.service');
const { toBooking } = require('../domain/booking');
const { toDriverOffer } = require('../domain/driver-offer');
const { AppError } = require('../../../../shared/errors/app-error');
const { id, text, actor, coordinates } = require('../../../../shared/validation');
const { createLogger } = require('../../../../shared/logging/logger');
const logger = createLogger('booking-service');

function location(value) {
  coordinates(value?.latitude, value?.longitude);
  return { latitude: value.latitude, longitude: value.longitude, address: text(value.address, 255, true) };
}
function pageInput(page = 1, limit = 2) {
  if (!Number.isInteger(page) || page < 1 || page > 2147483647 ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger((page-1)*limit)) {
    throw AppError.badRequest('Invalid pagination');
  }
  return { page, limit };
}
function createBookingService({ repo = repository, customer = customerClient, driver = driverClient,
  publish = publisher, transaction = database.withTransaction, matching } = {}) {
  const matcher = matching || createMatchingService({ repo, driver, publish, transaction });
  async function ownCustomer(context) {
    const userId = actor(context, ['CUSTOMER']);
    const profile = await customer.getCustomerByUserId(userId, context.correlationId);
    if (!profile) throw AppError.notFound('Customer does not exist');
    if (String(profile.userId) !== userId ||
        (context.actorCustomerId && id(context.actorCustomerId) !== String(profile.customerId))) throw AppError.forbidden();
    return { ...profile, customerId: id(profile.customerId) };
  }
  async function ownDriver(context) {
    const userId = actor(context, ['DRIVER']);
    const profile = await driver.getMyDriverProfile(context);
    if (!profile) throw AppError.notFound('Driver does not exist');
    if (String(profile.userId) !== userId ||
        (context.actorDriverId && id(context.actorDriverId) !== String(profile.driverId))) throw AppError.forbidden();
    return { ...profile, driverId: id(profile.driverId) };
  }
  async function emit(method, input) {
    try { await publish[method](input); }
    catch (_error) {
      logger.error('Booking event publication failed', { bookingId: String(input.bookingId), correlationId: input.correlationId });
      throw new AppError('Event publisher unavailable', { statusCode: 503, code: 'EVENT_PUBLISH_FAILED' });
    }
  }
  return {
    async createBooking(request) {
      actor(request.context, ['CUSTOMER']);
      const pickup = location(request.pickup), destination = location(request.destination);
      const vehicleType = text(request.vehicleType, 50);
      if (/^\d+$/.test(vehicleType)) throw AppError.badRequest('Vehicle type must be a string category');
      const profile = await ownCustomer(request.context);
      const created = await repo.createBooking({ customerId: profile.customerId, pickup, destination, vehicleType });
      await emit('publishBookingCreated', { bookingId: created.bid, customerId: created.cid, customerUserId: profile.userId,
        createdAt: new Date(created.c_at).toISOString(), correlationId: request.context.correlationId });
      try { await matcher.startMatching({ booking: created, correlationId: request.context.correlationId }); }
      catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('Matching unavailable', { statusCode: 503, code: 'MATCHING_UNAVAILABLE' });
      }
      return toBooking(await repo.findBookingById(created.bid));
    },
    async getBooking(request) {
      actor(request.context, ['CUSTOMER', 'DRIVER']);
      const row = await repo.findBookingById(id(request.bookingId));
      if (!row) throw AppError.notFound('Booking does not exist');
      if (request.context.actorRole === 'CUSTOMER') {
        const profile = await ownCustomer(request.context);
        if (String(row.cid) !== profile.customerId) throw AppError.forbidden();
      } else {
        const profile = await ownDriver(request.context);
        if (!await repo.driverHasOfferForBooking(row.bid, profile.driverId)) throw AppError.forbidden();
      }
      return toBooking(row);
    },
    async listMyBookings(request) {
      const profile = await ownCustomer(request.context);
      const page = pageInput(request.page || 1, request.limit || 2);
      const result = await repo.listCustomerBookings({ customerId: profile.customerId, ...page });
      return { ...page, total: result.total, items: result.rows.map(toBooking) };
    },
    async listMyOffers(request) {
      const profile = await ownDriver(request.context);
      return { items: (await repo.listOpenOffersByDriver(profile.driverId)).map(toDriverOffer) };
    },
    async acceptOffer(request) {
      const offerId = id(request.offerId);
      const profile = await ownDriver(request.context);
      let outcome;
      try {
        outcome = await transaction(async (client) => {
          const offer = await repo.lockOfferById(offerId, client);
          if (!offer) throw AppError.notFound('Offer does not exist');
          if (String(offer.did) !== profile.driverId) throw AppError.forbidden('Offer belongs to another Driver');
          if (offer.s === 'ACCEPTED') {
            const assignment = await repo.findAssignmentByOfferId(offerId, client);
            if (!assignment || offer.booking_status !== 'ASSIGNED') throw AppError.conflict('Assignment is inconsistent');
            return { offer, replay: true };
          }
          if (offer.s !== 'OPEN' || offer.booking_status !== 'SEARCHING' ||
              await repo.findAssignmentByBookingId(offer.bid, client)) throw AppError.conflict('Offer is no longer acceptable');
          if (profile.approvalStatus !== 'APPROVED' || profile.availabilityStatus !== 'AVAILABLE') {
            throw AppError.conflict('Driver must be approved and available');
          }
          id(offer.vid);
          const customerIdentity = await customer.validateCustomer(String(offer.cid), request.context.correlationId);
          if (!customerIdentity.valid || String(customerIdentity.customerId) !== String(offer.cid)) throw AppError.notFound('Customer does not exist');
          const customerUserId = id(customerIdentity.userId);
          // Driver owns the atomic eligibility transition. Persist only after success.
          const reserved = await driver.markBusyForAssignment(request.context, profile.driverId);
          if (reserved.driverId !== profile.driverId || reserved.approvalStatus !== 'APPROVED' || reserved.availabilityStatus !== 'BUSY') {
            throw AppError.internal('Invalid Driver assignment response');
          }
          const acceptedAt = new Date().toISOString();
          if (!await repo.markOfferAccepted(offerId, acceptedAt, client)) throw AppError.conflict();
          const assignment = await repo.createAssignment({ bookingId: offer.bid, offerId,
            driverId: offer.did, vehicleId: offer.vid, assignedAt: acceptedAt }, client);
          if (!await repo.setBookingStatus(offer.bid, 'ASSIGNED', 'SEARCHING', client, acceptedAt)) throw AppError.conflict();
          return { offer, assignment, acceptedAt, customerUserId, replay: false };
        });
      } catch (error) {
        if (error.code === '23505') throw AppError.conflict('Booking already assigned');
        throw error;
      }
      if (!outcome.replay) await emit('publishDriverAccepted', {
        assignmentId: outcome.assignment.aid, bookingId: outcome.offer.bid, customerId: outcome.offer.cid,
        driverId: outcome.offer.did, vehicleId: outcome.offer.vid, acceptedAt: outcome.acceptedAt,
        customerUserId: outcome.customerUserId, driverUserId: profile.userId,
        correlationId: request.context.correlationId,
      });
      return { offerId, bookingId: String(outcome.offer.bid), offerStatus: 'ACCEPTED', tripPending: true };
    },
  };
}
module.exports = { ...createBookingService(), createBookingService };
