'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/authorization.middleware');
const { z, parse, asyncHandler, context, pathId, locationSchema, location, publicId, publicLocation } = require('./transport');
const responses = require('./responses');

module.exports = function tripRoutes({ call }) {
  const router = express.Router();
  router.get('/trips/by-booking/:bid', authenticate, asyncHandler(async (req, res) => {
    const result = await call('trip', 'getTripByBooking', { context: context(req), bookingId: pathId(req, 'bid') }, req.correlationId);
    res.json(responses.trip(result));
  }));
  router.get('/trips/:tid', authenticate, asyncHandler(async (req, res) => {
    const result = await call('trip', 'getTrip', { context: context(req), tripId: pathId(req, 'tid') }, req.correlationId);
    res.json(responses.trip(result));
  }));
  router.patch('/trips/:tid/status', authenticate, requireRole('DRIVER'), asyncHandler(async (req, res) => {
    const body = parse(z.object({ s: z.enum(['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) }), req.body);
    const result = await call('trip', 'updateTripStatus', {
      context: context(req), tripId: pathId(req, 'tid'), status: body.s,
    }, req.correlationId);
    res.json(responses.trip(result));
  }));
  router.patch('/trips/:tid/location', authenticate, requireRole('DRIVER'), asyncHandler(async (req, res) => {
    const body = parse(locationSchema, req.body);
    const result = await call('trip', 'updateTripLocation', {
      context: context(req), tripId: pathId(req, 'tid'), ...location(body),
    }, req.correlationId);
    res.json({ tid: publicId(result.tripId), ...publicLocation(result) });
  }));
  router.post('/trips/:tid/cancel', authenticate, requireRole('CUSTOMER'), asyncHandler(async (req, res) => {
    const body = parse(z.object({ r: z.string().trim().min(1).max(100) }), req.body);
    const result = await call('trip', 'cancelTrip', {
      context: context(req), tripId: pathId(req, 'tid'), reason: body.r,
    }, req.correlationId);
    res.json(responses.trip(result));
  }));
  return router;
};
