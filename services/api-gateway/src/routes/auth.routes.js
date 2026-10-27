'use strict';

const express = require('express');
const { z, parse, asyncHandler, email, phone, publicId } = require('./transport');

module.exports = function authRoutes({ call }) {
  const router = express.Router();
  router.post('/register', asyncHandler(async (req, res) => {
    const body = parse(z.object({
      email, pw: z.string().min(3).refine((value) => value.trim().length > 0),
      name: z.string().trim().min(1).max(100),
      phone: phone.optional(),
    }), req.body);
    const account = await call('auth', 'createAccount', { email: body.email, password: body.pw, role: 'CUSTOMER' }, req.correlationId);
    const profile = await call('customer', 'createCustomerProfile', {
      userId: account.userId, name: body.name, correlationId: req.correlationId,
      ...(body.phone ? { phone: body.phone } : {}),
    }, req.correlationId);
    res.status(201).json({ uid: publicId(account.userId), cid: publicId(profile.customerId) });
  }));
  router.post('/login', asyncHandler(async (req, res) => {
    const body = parse(z.object({ email, pw: z.string().min(1) }), req.body);
    const result = await call('auth', 'login', { email: body.email, password: body.pw }, req.correlationId);
    const profileLookup = {
      CUSTOMER: { service: 'customer', method: 'getCustomerByUserId', field: 'customerId', alias: 'cid' },
      DRIVER: { service: 'driver', method: 'getDriverByUserId', field: 'driverId', alias: 'did' },
    }[result.role];
    const profileIds = {};
    if (profileLookup) {
      // Only use the authenticated Auth result, never a public uid/cid/did.
      try {
        const profile = await call(profileLookup.service, profileLookup.method, {
          userId: result.userId, correlationId: req.correlationId,
        }, req.correlationId);
        profileIds[profileLookup.alias] = publicId(profile[profileLookup.field]);
      } catch (error) {
        // An account may exist before its profile. Do not invent a profile ID.
        if (error.statusCode !== 404) throw error;
        profileIds[profileLookup.alias] = null;
      }
    }
    res.json({ token: result.accessToken, uid: publicId(result.userId), role: result.role, ...profileIds });
  }));
  return router;
};
