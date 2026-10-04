'use strict';

const express = require('express');
const { z, parse, asyncHandler, email, publicId } = require('./transport');

module.exports = function authRoutes({ call }) {
  const router = express.Router();
  router.post('/register', asyncHandler(async (req, res) => {
    const body = parse(z.object({
      email, pw: z.string().min(3).refine((value) => value.trim().length > 0),
      name: z.string().trim().min(1).max(100),
    }), req.body);
    const account = await call('auth', 'createAccount', { email: body.email, password: body.pw, role: 'CUSTOMER' }, req.correlationId);
    const profile = await call('customer', 'createCustomerProfile', {
      userId: account.userId, name: body.name, correlationId: req.correlationId,
    }, req.correlationId);
    res.status(201).json({ uid: publicId(account.userId), cid: publicId(profile.customerId) });
  }));
  router.post('/login', asyncHandler(async (req, res) => {
    const body = parse(z.object({ email, pw: z.string().min(1) }), req.body);
    const result = await call('auth', 'login', { email: body.email, password: body.pw }, req.correlationId);
    res.json({ token: result.accessToken, uid: publicId(result.userId), role: result.role });
  }));
  return router;
};
