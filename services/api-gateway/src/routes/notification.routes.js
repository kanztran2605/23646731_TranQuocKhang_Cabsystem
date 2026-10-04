'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { z, parse, asyncHandler, context, queryNumber } = require('./transport');
const responses = require('./responses');

module.exports = function notificationRoutes({ call }) {
  const router = express.Router();
  router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
    const query = parse(z.object({
      limit: queryNumber(z.number().int().min(1).max(20)).default('5'),
    }), req.query);
    const result = await call('notification', 'listNotifications', { context: context(req), limit: query.limit }, req.correlationId);
    res.json({ items: result.items.map(responses.notification) });
  }));
  return router;
};
