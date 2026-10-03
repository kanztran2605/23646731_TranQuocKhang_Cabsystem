'use strict';

const express =
  require('express');

const {
  checkDatabase,
} = require(
  './config/database'
);

const {
  checkRabbitMq,
} = require(
  './events/rabbitmq'
);

const app =
  express();

app.disable(
  'x-powered-by',
);

app.get(
  '/health',

  (_req, res) => {
    res
      .status(200)
      .json({
        service:
          'booking-service',

        status:
          'healthy',

        timestamp:
          new Date()
            .toISOString(),
      });
  },
);

app.get(
  '/ready',

  async (
    _req,
    res,
  ) => {
    try {
      await Promise.all([
        checkDatabase(),
        checkRabbitMq(),
      ]);

      res
        .status(200)
        .json({
          service:
            'booking-service',

          status:
            'ready',

          dependencies: {
            postgres:
              'ready',

            rabbitmq:
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
            'booking-service',

          status:
            'not-ready',

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

module.exports = app;