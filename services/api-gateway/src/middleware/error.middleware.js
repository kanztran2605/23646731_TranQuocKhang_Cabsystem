'use strict';

const {
  AppError,
  normalizeError,
} = require(
  '../../../../shared/errors/app-error'
);

const {
  createLogger,
} = require(
  '../../../../shared/logging/logger'
);

const logger =
  createLogger(
    process.env.SERVICE_NAME ||
      'api-gateway',
  );

function notFoundHandler(
  req,
  _res,
  next,
) {
  next(
    AppError.notFound(
      `Route not found: ${req.method} ${req.originalUrl}`,
      'NOT_FOUND',
    ),
  );
}

function errorHandler(
  error,
  req,
  res,
  _next,
) {
  const normalized =
    normalizeError(error);

  const logPayload = {
    correlationId:
      req.correlationId,

    method:
      req.method,

    path:
      req.originalUrl,

    code:
      normalized.code,

    statusCode:
      normalized.statusCode,

    error:
      normalized,
  };

  if (
    normalized.statusCode >=
    500
  ) {
    logger.error(
      'HTTP request failed',
      logPayload,
    );
  } else {
    logger.warn(
      'HTTP request rejected',
      logPayload,
    );
  }

  if (res.headersSent) {
    return;
  }

  res
    .status(
      normalized.statusCode,
    )
    .json(
      normalized.toResponse(),
    );
}

module.exports = {
  notFoundHandler,
  errorHandler,
};