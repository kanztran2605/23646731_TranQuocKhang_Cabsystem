'use strict';
const repository = require('../repositories/booking.repository');
const driverClient = require('../grpc/driver.client');
const publisher = require('../events/booking.publisher');
const database = require('../config/database');
const { id } = require('../../../../shared/validation');

const MATCH_RADIUS_KM = Number(process.env.BOOKING_MATCH_RADIUS_KM || 1);
const MATCH_CANDIDATE_LIMIT = Number(process.env.BOOKING_MATCH_CANDIDATE_LIMIT || 20);
if (!Number.isFinite(MATCH_RADIUS_KM) || MATCH_RADIUS_KM <= 0 ||
    !Number.isInteger(MATCH_CANDIDATE_LIMIT) || MATCH_CANDIDATE_LIMIT < 1 || MATCH_CANDIDATE_LIMIT > 20) {
  throw new Error('Invalid Booking matching configuration');
}
function createMatchingService({ repo = repository, driver = driverClient, publish = publisher, transaction = database.withTransaction } = {}) {
  return {
    async startMatching({ booking, correlationId }) {
      if (!booking || booking.s !== 'SEARCHING') return null;
      const existing = await repo.findOfferForBooking(booking.bid);
      if (existing) return existing;
      // FindEligibleDrivers owns APPROVED + AVAILABLE filtering in driver_db.
      const result = await driver.findEligibleDrivers({
        pickupLatitude: Number(booking.p_lat), pickupLongitude: Number(booking.p_lng),
        radiusKm: MATCH_RADIUS_KM, vehicleType: booking.vt, limit: MATCH_CANDIDATE_LIMIT, correlationId,
      });
      const candidate = (result.items || []).filter((item) =>
        item.vehicleType === booking.vt && Number.isFinite(item.distanceKm) &&
        item.distanceKm >= 0 && item.distanceKm <= MATCH_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm || (BigInt(id(a.driverId)) < BigInt(id(b.driverId)) ? -1 : 1))[0];
      if (candidate) { id(candidate.driverId); id(candidate.vehicleId); id(candidate.userId); }
      const outcome = await transaction(async (client) => {
        const current = await repo.lockBookingById(booking.bid, client);
        if (!current || current.s !== 'SEARCHING') return {};
        const offer = await repo.findOfferForBooking(booking.bid, client);
        if (offer) return { offer };
        if (!candidate) {
          return { booking: await repo.setBookingStatus(booking.bid, 'NO_DRIVER_FOUND', 'SEARCHING', client) };
        }
        return { created: true, offer: await repo.createDriverOffer({
          bookingId: booking.bid, driverId: candidate.driverId, vehicleId: candidate.vehicleId,
        }, client) };
      });
      if (outcome.created) await publish.publishOfferCreated({
        offerId: outcome.offer.oid, bookingId: outcome.offer.bid, driverId: outcome.offer.did,
        driverUserId: candidate.userId,
        createdAt: new Date(outcome.offer.c_at).toISOString(), correlationId,
      });
      return outcome.offer || outcome.booking || null;
    },
  };
}
module.exports = { ...createMatchingService(), createMatchingService, MATCH_RADIUS_KM, MATCH_CANDIDATE_LIMIT };
