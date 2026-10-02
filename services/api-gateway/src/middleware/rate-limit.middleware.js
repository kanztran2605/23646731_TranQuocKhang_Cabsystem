'use strict';

const {
  createHash,
} = require('node:crypto');

const env =
  require('../config/env');

const {
  getRedisClient,
  connectRedis,
} = require(
  '../config/redis'
);

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])

if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

return {
  current,
  redis.call('PTTL', KEYS[1])
}
`;

function identityHash(req) {
  const identity =
    req.auth?.userId ||
    req.ip ||
    'anonymous';

  return createHash(
    'sha256',
  )
    .update(
      String(identity),
    )
    .digest('hex')
    .slice(0, 32);
}

function createRateLimitMiddleware({
  scope = 'api',

  windowMs =
    env.RATE_LIMIT_WINDOW_MS,

  maxRequests =
    env.RATE_LIMIT_MAX_REQUESTS,
} = {}) {
  return async function rateLimitMiddleware(
    req,
    res,
    next,
  ) {
    try {
      await connectRedis();

      const redis =
        getRedisClient();

      const bucket =
        Math.floor(
          Date.now() /
            windowMs,
        );

      const key = [
        'cab',
        'gateway',
        'ratelimit',
        scope,
        identityHash(req),
        bucket,
      ].join(':');

      const result =
        await redis.eval(
          RATE_LIMIT_SCRIPT,
          {
            keys: [key],

            arguments: [
              String(windowMs),
            ],
          },
        );

      const current =
        Number(
          result?.[0] ?? 0,
        );

      const ttlMs =
        Math.max(
          Number(
            result?.[1] ??
              windowMs,
          ),
          0,
        );

      const remaining =
        Math.max(
          maxRequests -
            current,
          0,
        );

      res.setHeader(
        'RateLimit-Limit',
        String(maxRequests),
      );

      res.setHeader(
        'RateLimit-Remaining',
        String(remaining),
      );

      res.setHeader(
        'RateLimit-Reset',
        String(
          Math.ceil(
            ttlMs / 1000,
          ),
        ),
      );

      if (
        current >
        maxRequests
      ) {
        res.setHeader(
          'Retry-After',
          String(
            Math.max(
              Math.ceil(
                ttlMs /
                  1000,
              ),
              1,
            ),
          ),
        );

        next(
          AppError.tooManyRequests(
            'Too many requests',
            'RATE_LIMITED',
          ),
        );

        return;
      }

      next();
    } catch (error) {
      next(
        AppError.internal(
          'Rate limiting service is unavailable',
          'RATE_LIMIT_UNAVAILABLE',
          error,
        ),
      );
    }
  };
}

const apiRateLimit =
  createRateLimitMiddleware({
    scope: 'api',
  });

module.exports = {
  RATE_LIMIT_SCRIPT,
  createRateLimitMiddleware,
  apiRateLimit,
};