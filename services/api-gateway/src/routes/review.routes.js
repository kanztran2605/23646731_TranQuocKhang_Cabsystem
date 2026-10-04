'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/authorization.middleware');
const { z, parse, asyncHandler, context, pathId } = require('./transport');
const responses = require('./responses');

module.exports = function reviewRoutes({ call }) {
  const router = express.Router();
  router.post('/trips/:tid/reviews', authenticate, requireRole('CUSTOMER'), asyncHandler(async (req, res) => {
    const body = parse(z.object({ star: z.number().int().min(1).max(5), c: z.string().max(255).optional() }), req.body);
    const result = await call('review', 'createReview', {
      context: context(req), tripId: pathId(req, 'tid'), score: body.star,
      ...(body.c !== undefined ? { comment: body.c } : {}),
    }, req.correlationId);
    res.status(201).json(responses.review(result));
  }));
  return router;
};
