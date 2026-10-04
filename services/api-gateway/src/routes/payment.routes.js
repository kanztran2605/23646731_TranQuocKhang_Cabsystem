'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/authorization.middleware');
const { z, parse, asyncHandler, context, pathId } = require('./transport');
const responses = require('./responses');

module.exports = function paymentRoutes({ call }) {
  const router = express.Router();
  router.get('/payments/by-booking/:bid', authenticate, requireRole('CUSTOMER', 'ADMIN'), asyncHandler(async (req, res) => {
    const result = await call('payment', 'getPaymentByBooking', { context: context(req), bookingId: pathId(req, 'bid') }, req.correlationId);
    res.json(responses.payment(result));
  }));
  router.get('/payments/:pid', authenticate, asyncHandler(async (req, res) => {
    const result = await call('payment', 'getPayment', { context: context(req), paymentId: pathId(req, 'pid') }, req.correlationId);
    res.json(responses.payment(result));
  }));
  router.post('/payments/:pid/pay', authenticate, requireRole('CUSTOMER'), asyncHandler(async (req, res) => {
    const key = parse(z.string().trim().min(1), req.get('Idempotency-Key'));
    const result = await call('payment', 'payExistingPayment', {
      context: context(req), paymentId: pathId(req, 'pid'), idempotencyKey: key,
    }, req.correlationId);
    res.json(responses.payment(result));
  }));
  router.post('/payments/:pid/callback', authenticate, requireRole('CUSTOMER', 'ADMIN'), asyncHandler(async (req, res) => {
    const body = parse(z.object({ s: z.literal('COMPLETED') }), req.body);
    const result = await call('payment', 'paymentCallback', {
      context: context(req), paymentId: pathId(req, 'pid'), status: body.s,
    }, req.correlationId);
    res.json(responses.payment(result));
  }));
  return router;
};
