'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler, context } = require('./transport');

module.exports = function vehicleRoutes({ call }) {
  const router = express.Router();
  router.get('/vehicle-types', authenticate, asyncHandler(async (req, res) => {
    const result = await call('driver', 'listVehicleTypes', { context: context(req) }, req.correlationId);
    res.json(result.items.map((item) => ({ vt: item.vehicleType, name: item.name })));
  }));
  return router;
};
