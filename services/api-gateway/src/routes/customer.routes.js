'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/authorization.middleware');
const { asyncHandler, context, pathId } = require('./transport');
const responses = require('./responses');

module.exports = function customerRoutes({ call }) {
  const router = express.Router();
  router.get('/customers', authenticate, requireRole('ADMIN'), asyncHandler(async (req, res) => {
    const result = await call('customer', 'listCustomers', { context: context(req) }, req.correlationId);
    res.json({ Total: result.items.length, items: result.items.map(responses.customer) });
  }));
  router.get('/customers/:cid', authenticate, requireRole('CUSTOMER', 'ADMIN'), asyncHandler(async (req, res) => {
    const result = await call('customer', 'getCustomer', {
      context: context(req), customerId: pathId(req, 'cid'),
    }, req.correlationId);
    res.json(responses.customer(result));
  }));
  return router;
};
