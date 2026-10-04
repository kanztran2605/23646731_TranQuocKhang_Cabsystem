'use strict';

const { correlationId } = require('../../../../shared/correlation');
const { createLogger } = require('../../../../shared/logging/logger');
const logger = createLogger('api-gateway');

function correlationMiddleware(req, res, next) {
  req.correlationId = correlationId(req.get('x-correlation-id') || req.get('x-request-id'));
  res.setHeader('x-correlation-id', req.correlationId);
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => logger.info('HTTP request completed', {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    durationMs: Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(2)),
  }));
  next();
}

module.exports = { correlationMiddleware };
