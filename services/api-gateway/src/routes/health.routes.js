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
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch (_error) {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = function healthRoutes({
  pingRedis,
  checkServiceHealth,
}) {
  const router = express.Router();

  const publicStatus = (healthy) =>
    healthy ? 'HEALTHY' : 'UNHEALTHY';

  async function services(req) {
    return Promise.all(
      Object.values(SERVICE_DEFINITIONS).map(async (service) => {
        const result = await bounded(
          () => checkServiceHealth(service.key, req.correlationId),
          env.GRPC_HEALTH_TIMEOUT_MS,
          { s: 'DOWN' },
        );

        return {
          name: service.name,
          healthy: result?.s === 'UP',
        };
      }),
    );
  }

  // Kiểm tra Gateway còn hoạt động
  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'HEALTHY',
    });
  });

  // Kiểm tra Redis và toàn bộ 8 service
  router.get('/ready', asyncHandler(async (req, res) => {
    const [redisReady, checks] = await Promise.all([
      bounded(pingRedis, env.GRPC_HEALTH_TIMEOUT_MS, false),
      services(req),
    ]);

    const ready =
      redisReady === true &&
      checks.every((service) => service.healthy);

    res.status(ready ? 200 : 503).json({
      status: publicStatus(ready),
    });
  }));

  // Hiển thị trạng thái từng microservice
  router.get('/health/services', asyncHandler(async (req, res) => {
    const checks = await services(req);

    res.status(200).json({
      status: publicStatus(
        checks.every((service) => service.healthy),
      ),
      services: checks.map((service) => ({
        name: service.name,
        status: publicStatus(service.healthy),
      })),
    });
  }));

  return router;
};