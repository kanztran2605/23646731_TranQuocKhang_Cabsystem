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
    // K chỉ là alias REST tại Pay; Payment Service vẫn nhận một idempotencyKey.
    const keySchema = z.string().trim().min(1).max(100).optional();
    const keys = parse(z.object({ full: keySchema, short: keySchema }).refine(value =>
      (value.full !== undefined || value.short !== undefined) &&
      (value.full === undefined || value.short === undefined || value.full === value.short)
    ), { full: req.get('Idempotency-Key'), short: req.get('K') });
    const body = parse(z.object({ amt:z.number().finite().positive().optional() }).strict(),req.body ?? {});
    const result = await call('payment', 'payExistingPayment', {
      context: context(req), paymentId: pathId(req, 'pid'), idempotencyKey: keys.full ?? keys.short,
      ...(body.amt !== undefined ? { amount:body.amt } : {}),
    }, req.correlationId);
    res.json(responses.payment(result));
  }));
  router.post('/payments/:pid/callback', authenticate, requireRole('CUSTOMER', 'ADMIN'), asyncHandler(async (req, res) => {
    parse(z.object({ s: z.enum(['C', 'COMPLETED']) }).strict(), req.body);
    const result = await call('payment', 'paymentCallback', {
      context: context(req), paymentId: pathId(req, 'pid'), status: 'COMPLETED',
    }, req.correlationId);
    res.json(responses.payment(result));
  }));
  return router;
};
