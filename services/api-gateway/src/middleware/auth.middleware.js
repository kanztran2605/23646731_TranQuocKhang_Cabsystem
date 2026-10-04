'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError } = require('../../../../shared/errors/app-error');

function authenticate(req, _res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  if (!match) return next(AppError.unauthorized('Missing access token'));
  try {
    const payload = jwt.verify(match[1], env.JWT_SECRET, { algorithms: ['HS256'] });
    // Verification alone accepts tokens without exp; CAB access tokens require it.
    if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string' || !payload.sub.trim() ||
        !['CUSTOMER', 'DRIVER', 'ADMIN'].includes(payload.role) || !Number.isFinite(payload.exp)) {
      throw new Error('Invalid access token claims');
    }
    req.auth = {
      userId: payload.sub,
      role: payload.role,
      ...(typeof payload.customerId === 'string' ? { customerId: payload.customerId } : {}),
      ...(typeof payload.driverId === 'string' ? { driverId: payload.driverId } : {}),
    };
    next();
  } catch (_error) {
    next(AppError.unauthorized('Invalid or expired access token'));
  }
}

module.exports = { authenticate };
