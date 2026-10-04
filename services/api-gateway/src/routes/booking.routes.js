'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/authorization.middleware');
const { z, parse, asyncHandler, context, pathId, pagination, locationSchema, location, vehicleType, publicId } = require('./transport');
const responses = require('./responses');

module.exports = function bookingRoutes({ call }) {
  const router = express.Router();
  router.post('/bookings', authenticate, requireRole('CUSTOMER'), asyncHandler(async (req, res) => {
    const body = parse(z.object({ p: locationSchema, d: locationSchema, vt: vehicleType }), req.body);
    const result = await call('booking', 'createBooking', {
      context: context(req), pickup: location(body.p), destination: location(body.d), vehicleType: body.vt,
    }, req.correlationId);
    res.status(201).json(responses.booking(result));
  }));
  router.get('/bookings/:bid', authenticate, asyncHandler(async (req, res) => {
    const result = await call('booking', 'getBooking', { context: context(req), bookingId: pathId(req, 'bid') }, req.correlationId);
    res.json(responses.booking(result));
  }));
  router.get('/customers/me/bookings', authenticate, requireRole('CUSTOMER'), asyncHandler(async (req, res) => {
    const query = parse(pagination(2), req.query);
    const result = await call('booking', 'listMyBookings', { context: context(req), ...query }, req.correlationId);
    res.json(responses.page(result, responses.booking));
  }));
  router.get('/drivers/me/offers', authenticate, requireRole('DRIVER'), asyncHandler(async (req, res) => {
    const result = await call('booking', 'listMyOffers', { context: context(req) }, req.correlationId);
    res.json(result.items.map(responses.offer));
  }));
  router.post('/offers/:oid/accept', authenticate, requireRole('DRIVER'), asyncHandler(async (req, res) => {
    const result = await call('booking', 'acceptOffer', { context: context(req), offerId: pathId(req, 'oid') }, req.correlationId);
    res.json({ oid: publicId(result.offerId), bid: publicId(result.bookingId), s: result.offerStatus, tripPending: result.tripPending });
  }));
  return router;
};
