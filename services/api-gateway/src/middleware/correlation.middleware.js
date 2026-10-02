'use strict';

const {
  randomUUID,
} = require('node:crypto');

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

function normalizeCorrelationId(
  value,
) {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > 128
  ) {
    return null;
  }

  return normalized;
}

function correlationMiddleware(
  req,
  res,
  next,
) {
  const correlationId =
    normalizeCorrelationId(
      req.get(
        'x-correlation-id',
      ),
    ) ||
    randomUUID();

  req.correlationId =
    correlationId;

  res.setHeader(
    'x-correlation-id',
    correlationId,
  );

  const startedAt =
    process.hrtime.bigint();

  res.on(
    'finish',
    () => {
      const elapsedMs =
        Number(
          process.hrtime.bigint() -
            startedAt,
        ) / 1e6;

      logger.info(
        'HTTP request completed',
        {
          correlationId,

          method:
            req.method,

          path:
            req.originalUrl,

          statusCode:
            res.statusCode,

          durationMs:
            Number(
              elapsedMs.toFixed(2),
            ),
        },
      );
    },
  );

  next();
}

module.exports = {
  correlationMiddleware,
};