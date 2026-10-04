'use strict';

const { AppError, normalizeError } = require('../../../../shared/errors/app-error');
const { createLogger } = require('../../../../shared/logging/logger');
const logger = createLogger('api-gateway');

function notFoundHandler(_req, _res, next) {
  next(AppError.notFound('Route not found'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const normalized = error?.type === 'entity.parse.failed'
    ? AppError.badRequest('Invalid JSON body')
    : error?.type === 'entity.too.large'
      ? AppError.badRequest('Request body too large')
      : normalizeError(error);
  const log = normalized.statusCode >= 500 ? logger.error : logger.warn;
  log('HTTP request rejected', {
    correlationId: req.correlationId, method: req.method, path: req.path,
    code: normalized.code, statusCode: normalized.statusCode,
  });
  res.status(normalized.statusCode).json({
    code: normalized.code,
    message: normalized.expose ? normalized.message : 'Internal server error',
    at: new Date().toISOString(),
  });
}

module.exports = { notFoundHandler, errorHandler };
