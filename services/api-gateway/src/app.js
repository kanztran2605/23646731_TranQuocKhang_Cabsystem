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
const { presentationMiddleware } = require('./middleware/presentation.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

function createApp({
  callRpc = grpcClients.callRpc,
  checkServiceHealth = grpcClients.checkServiceHealth,
  pingRedis = redis.pingRedis,
  redisClient = redis.getRedisClient,
  demoSecurityEnabled = env.DEMO_SECURITY_ENABLED,
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
  // Root aliases support process/container probes; /api is the demo entry point.
  app.use(health);
  const apiPrefixes = ['/api/v1', '/api'];

  app.use(apiPrefixes, health);
  app.use(apiPrefixes, presentationMiddleware);
  app.use(apiPrefixes, createRateLimitMiddleware({ redisClient }));
  const call = async (...args) => {
    try { return await callRpc(...args); }
    catch (error) { throw grpcToAppError(error); }
  };
  for (const name of ['auth', 'booking', 'customer', 'driver', 'vehicle', 'trip', 'payment', 'notification', 'review']) {
    app.use(apiPrefixes, require('./routes/' + name + '.routes')({ call }));
  }
  // Chỉ có một URL demo mới, không tạo alias /api/v1 cho endpoint này.
  app.use('/api', require('./routes/admin-security.routes')({ call, enabled:demoSecurityEnabled }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
