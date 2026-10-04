'use strict';

const { createHash } = require('node:crypto');
const env = require('../config/env');
const { getRedisClient } = require('../config/redis');
const { AppError } = require('../../../../shared/errors/app-error');

const RATE_LIMIT_SCRIPT = [
  "local current = redis.call('INCR', KEYS[1])",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if ttl < 0 then",
  "  redis.call('PEXPIRE', KEYS[1], ARGV[1])",
  "  ttl = tonumber(ARGV[1])",
  "end",
  "return { current, ttl }",
].join('\n');

function createRateLimitMiddleware({
  redisClient = getRedisClient,
  windowMs = env.RATE_LIMIT_WINDOW_MS,
  maxRequests = env.RATE_LIMIT_MAX_REQUESTS,
} = {}) {
  return async (req, res, next) => {
    let timer;
    try {
      const redis = redisClient();
      if (!redis.isReady) throw new Error('Redis unavailable');
      // Per-IP at the transport boundary, before JWT authentication.
      const identity = createHash('sha256').update(req.ip || 'anonymous').digest('hex');
      const result = await Promise.race([
        redis.eval(RATE_LIMIT_SCRIPT, {
          keys: ['cab:gateway:ratelimit:api:' + identity],
          arguments: [String(windowMs)],
        }),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Redis timed out')), 1500);
        }),
      ]);
      const current = Number(result?.[0]);
      const ttlMs = Number(result?.[1]);
      if (!Number.isInteger(current) || current < 1 || !Number.isFinite(ttlMs) || ttlMs < 0) {
        throw new Error('Invalid Redis rate-limit response');
      }
      const reset = Math.max(Math.ceil(ttlMs / 1000), 1);
      res.setHeader('RateLimit-Limit', String(maxRequests));
      res.setHeader('RateLimit-Remaining', String(Math.max(maxRequests - current, 0)));
      res.setHeader('RateLimit-Reset', String(reset));
      if (current > maxRequests) {
        res.setHeader('Retry-After', String(reset));
        return next(AppError.tooManyRequests());
      }
      next();
    } catch (_error) {
      next(new AppError('Rate limiter unavailable', { code: 'RATE_LIMIT_UNAVAILABLE', statusCode: 503 }));
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { RATE_LIMIT_SCRIPT, createRateLimitMiddleware };
