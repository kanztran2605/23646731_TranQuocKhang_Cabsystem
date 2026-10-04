'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/authorization.middleware');
const { z, parse, asyncHandler, context, pathId, pagination, locationSchema, location, email, vehicleType, queryNumber, publicId } = require('./transport');
const responses = require('./responses');

module.exports = function driverRoutes({ call }) {
  const router = express.Router();
  router.post('/drivers/otp', asyncHandler(async (req, res) => {
    const body = parse(z.object({ email }), req.body);
    const result = await call('driver', 'requestOtp', { email: body.email, correlationId: req.correlationId }, req.correlationId);
    res.json({ otp: result.otp });
  }));
  router.post('/drivers/register', asyncHandler(async (req, res) => {
    const body = parse(z.object({
      email, pw: z.string().min(1).refine((value) => value.trim().length > 0),
      otp: z.string().trim().min(1), name: z.string().trim().min(1),
      vt: vehicleType, plate: z.string().trim().min(1),
    }), req.body);
    const account = await call('auth', 'createAccount', { email: body.email, password: body.pw, role: 'DRIVER' }, req.correlationId);
    const result = await call('driver', 'registerDriver', {
      context: { actorUserId: account.userId, actorRole: 'DRIVER', correlationId: req.correlationId },
      userId: account.userId, otp: body.otp, name: body.name, vehicleType: body.vt, licensePlate: body.plate,
    }, req.correlationId);
    res.status(201).json({ uid: publicId(result.userId), did: publicId(result.driverId), ap: result.approvalStatus });
  }));
  router.get('/drivers/pending-approval', authenticate, requireRole('ADMIN'), asyncHandler(async (req, res) => {
    const query = parse(pagination(5, 20), req.query);
    const result = await call('driver', 'listPendingDrivers', { context: context(req), ...query }, req.correlationId);
    res.json(responses.page(result, responses.driver));
  }));
  router.get('/drivers/nearby', authenticate, requireRole('ADMIN'), asyncHandler(async (req, res) => {
    const query = parse(pagination(5, 20).extend({
      lat: queryNumber(z.number().finite().min(-90).max(90)),
      lng: queryNumber(z.number().finite().min(-180).max(180)),
      r: queryNumber(z.number().finite().positive()).default('1'),
    }), req.query);
    const result = await call('driver', 'getNearbyDrivers', {
      context: context(req), latitude: query.lat, longitude: query.lng, radiusKm: query.r,
      page: query.page, limit: query.limit,
    }, req.correlationId);
    res.json(responses.page(result, responses.driver));
  }));
  router.patch('/drivers/me/availability', authenticate, requireRole('DRIVER'), asyncHandler(async (req, res) => {
    const body = parse(z.object({ on: z.boolean() }), req.body);
    const result = await call('driver', 'setAvailability', { context: context(req), online: body.on }, req.correlationId);
    res.json(responses.driver(result));
  }));
  router.put('/drivers/me/location', authenticate, requireRole('DRIVER'), asyncHandler(async (req, res) => {
    const body = parse(locationSchema, req.body);
    const updated = await call('driver', 'updateLocation', { context: context(req), ...location(body) }, req.correlationId);
    // The public response is Driver; UpdateLocation returns only DriverLocation.
    const profile = await call('driver', 'getDriverByUserId', {
      userId: req.auth.userId, correlationId: req.correlationId,
    }, req.correlationId);
    res.json(responses.driver({ ...profile, location: updated }));
  }));
  router.patch('/drivers/:did/approval', authenticate, requireRole('ADMIN'), asyncHandler(async (req, res) => {
    const body = parse(z.object({ ap: z.enum(['APPROVED', 'REJECTED']) }), req.body);
    const result = await call('driver', 'reviewDriverApproval', {
      context: context(req), driverId: pathId(req, 'did'), approvalStatus: body.ap,
    }, req.correlationId);
    res.json(responses.driver(result));
  }));
  router.get('/drivers/:did', authenticate, requireRole('ADMIN'), asyncHandler(async (req, res) => {
    const result = await call('driver', 'getDriver', { context: context(req), driverId: pathId(req, 'did') }, req.correlationId);
    res.json(responses.driver(result));
  }));
  return router;
};
