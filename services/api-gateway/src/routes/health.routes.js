'use strict';

const express =
  require('express');

const {
  pingRedis,
} = require(
  '../config/redis'
);

const {
  SERVICE_DEFINITIONS,
  checkServiceHealth,
} = require(
  '../clients/grpc-clients'
);

const router =
  express.Router();

router.get(
  '/health',

  (_req, res) => {
    res.status(200).json({
      service:
        'api-gateway',

      status:
        'healthy',

      timestamp:
        new Date()
          .toISOString(),
    });
  },
);

router.get(
  '/ready',

  async (_req, res) => {
    try {
      const redisReady =
        await pingRedis();

      if (!redisReady) {
        throw new Error(
          'Redis did not return PONG',
        );
      }

      res
        .status(200)
        .json({
          service:
            'api-gateway',

          status:
            'ready',

          dependencies: {
            redis:
              'ready',
          },

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (_error) {
      res
        .status(503)
        .json({
          service:
            'api-gateway',

          status:
            'not-ready',

          dependencies: {
            redis:
              'unavailable',
          },

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

router.get(
  '/health/services',

  async (_req, res) => {
    const serviceKeys =
      Object.keys(
        SERVICE_DEFINITIONS,
      );

    const checks =
      await Promise.all(
        serviceKeys.map(
          (serviceKey) =>
            checkServiceHealth(
              serviceKey,
            ),
        ),
      );

    const services =
      Object.fromEntries(
        checks.map(
          (check) => [
            check.name,
            check.status,
          ],
        ),
      );

    const allHealthy =
      checks.every(
        (check) =>
          check.status ===
          'healthy',
      );

    res
      .status(200)
      .json({
        status:
          allHealthy
            ? 'healthy'
            : 'degraded',

        services,

        timestamp:
          new Date()
            .toISOString(),
      });
  },
);

module.exports = router;