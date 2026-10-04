'use strict';

const express = require('express');
const env = require('../config/env');
const { SERVICE_DEFINITIONS } = require('../config/grpc');
const { asyncHandler } = require('./transport');

async function bounded(check, timeoutMs, fallback) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(check),
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } catch (_error) {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = function healthRoutes({ pingRedis, checkServiceHealth }) {
  const router = express.Router();
  async function services(req) {
    return Promise.all(Object.values(SERVICE_DEFINITIONS).map(async (service) => {
      const result = await bounded(
        () => checkServiceHealth(service.key, req.correlationId),
        env.GRPC_HEALTH_TIMEOUT_MS, { s: 'DOWN' },
      );
      return { name: service.name, s: result?.s === 'UP' ? 'UP' : 'DOWN' };
    }));
  }
  router.get('/health', (_req, res) => res.json({ s: 'UP' }));
  router.get('/ready', asyncHandler(async (req, res) => {
    const [redisReady, checks] = await Promise.all([
      bounded(pingRedis, env.GRPC_HEALTH_TIMEOUT_MS, false), services(req),
    ]);
    const ready = redisReady === true && checks.every((check) => check.s === 'UP');
    res.status(ready ? 200 : 503).json({ s: ready ? 'UP' : 'DOWN' });
  }));
  router.get('/health/services', asyncHandler(async (req, res) => {
    const checks = await services(req);
    res.json({ s: checks.every((check) => check.s === 'UP') ? 'UP' : 'DOWN', services: checks });
  }));
  return router;
};
