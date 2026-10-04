'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const grpcClients = require('./clients/grpc-clients');
const redis = require('./config/redis');
const { grpcToAppError } = require('../../../shared/errors/grpc-error');
const { AppError } = require('../../../shared/errors/app-error');
const { correlationMiddleware } = require('./middleware/correlation.middleware');
const { createRateLimitMiddleware } = require('./middleware/rate-limit.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

function createApp({
  callRpc = grpcClients.callRpc,
  checkServiceHealth = grpcClients.checkServiceHealth,
  pingRedis = redis.pingRedis,
  redisClient = redis.getRedisClient,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlationMiddleware);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      callback(AppError.forbidden('Origin is not allowed by CORS', 'CORS_FORBIDDEN'));
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  const health = require('./routes/health.routes')({ pingRedis, checkServiceHealth });
  // Root aliases support process/container probes; the documented API uses /api/v1.
  app.use(health);
  app.use('/api/v1', health);
  app.use('/api/v1', createRateLimitMiddleware({ redisClient }));
  const call = async (...args) => {
    try { return await callRpc(...args); }
    catch (error) { throw grpcToAppError(error); }
  };
  for (const name of ['auth', 'booking', 'customer', 'driver', 'vehicle', 'trip', 'payment', 'notification', 'review']) {
    app.use('/api/v1', require('./routes/' + name + '.routes')({ call }));
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
