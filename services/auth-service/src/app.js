'use strict';

const express =
  require('express');

const {
  checkDatabase,
} = require(
  './config/database'
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
          'auth-service',

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

  async (_req, res) => {
    try {
      await checkDatabase();

      res
        .status(200)
        .json({
          service:
            'auth-service',

          status:
            'ready',

          dependencies: {
            postgres:
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
            'auth-service',

          status:
            'not-ready',

          dependencies: {
            postgres:
              'unavailable',
          },

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

module.exports = app;