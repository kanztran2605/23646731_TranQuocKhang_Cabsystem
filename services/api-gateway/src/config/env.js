'use strict';

function requiredString(name, fallback) {
  const raw = process.env[name] ?? fallback;
  const value = typeof raw === 'string' ? raw.trim() : '';

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function positiveInteger(name, fallback) {
  const raw = process.env[name] ?? fallback;
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function csv(name, fallback = '') {
  const raw = process.env[name] ?? fallback;

  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',

  SERVICE_NAME: process.env.SERVICE_NAME || 'api-gateway',

  API_GATEWAY_HOST:
    process.env.API_GATEWAY_HOST || '0.0.0.0',

  API_GATEWAY_PORT: positiveInteger(
    'API_GATEWAY_PORT',
    process.env.PORT || 8080,
  ),

  CORS_ORIGINS: csv(
    'CORS_ORIGINS',
    'http://localhost:3000,http://localhost:5173',
  ),

  JWT_SECRET: requiredString('JWT_SECRET'),

  REDIS_HOST: requiredString(
    'REDIS_HOST',
    'redis',
  ),

  REDIS_PORT: positiveInteger(
    'REDIS_PORT',
    6379,
  ),

  REDIS_PASSWORD: requiredString(
    'REDIS_PASSWORD',
  ),

  RATE_LIMIT_WINDOW_MS: positiveInteger(
    'RATE_LIMIT_WINDOW_MS',
    1000,
  ),

  RATE_LIMIT_MAX_REQUESTS: positiveInteger(
    'RATE_LIMIT_MAX_REQUESTS',
    1000,
  ),

  GRPC_HEALTH_TIMEOUT_MS: positiveInteger(
    'GRPC_HEALTH_TIMEOUT_MS',
    1500,
  ),

  AUTH_SERVICE_HOST: requiredString(
    'AUTH_SERVICE_HOST',
    'auth-service',
  ),
  AUTH_GRPC_PORT: positiveInteger(
    'AUTH_GRPC_PORT',
    50051,
  ),

  CUSTOMER_SERVICE_HOST: requiredString(
    'CUSTOMER_SERVICE_HOST',
    'customer-service',
  ),
  CUSTOMER_GRPC_PORT: positiveInteger(
    'CUSTOMER_GRPC_PORT',
    50052,
  ),

  DRIVER_SERVICE_HOST: requiredString(
    'DRIVER_SERVICE_HOST',
    'driver-service',
  ),
  DRIVER_GRPC_PORT: positiveInteger(
    'DRIVER_GRPC_PORT',
    50053,
  ),

  BOOKING_SERVICE_HOST: requiredString(
    'BOOKING_SERVICE_HOST',
    'booking-service',
  ),
  BOOKING_GRPC_PORT: positiveInteger(
    'BOOKING_GRPC_PORT',
    50054,
  ),

  TRIP_SERVICE_HOST: requiredString(
    'TRIP_SERVICE_HOST',
    'trip-service',
  ),
  TRIP_GRPC_PORT: positiveInteger(
    'TRIP_GRPC_PORT',
    50055,
  ),

  PAYMENT_SERVICE_HOST: requiredString(
    'PAYMENT_SERVICE_HOST',
    'payment-service',
  ),
  PAYMENT_GRPC_PORT: positiveInteger(
    'PAYMENT_GRPC_PORT',
    50056,
  ),

  NOTIFICATION_SERVICE_HOST: requiredString(
    'NOTIFICATION_SERVICE_HOST',
    'notification-service',
  ),
  NOTIFICATION_GRPC_PORT: positiveInteger(
    'NOTIFICATION_GRPC_PORT',
    50057,
  ),

  REVIEW_SERVICE_HOST: requiredString(
    'REVIEW_SERVICE_HOST',
    'review-service',
  ),
  REVIEW_GRPC_PORT: positiveInteger(
    'REVIEW_GRPC_PORT',
    50058,
  ),

  REPORT_SERVICE_HOST: requiredString(
    'REPORT_SERVICE_HOST',
    'report-service',
  ),
  REPORT_GRPC_PORT: positiveInteger(
    'REPORT_GRPC_PORT',
    50059,
  ),

  AUDIT_SERVICE_HOST: requiredString(
    'AUDIT_SERVICE_HOST',
    'audit-service',
  ),
  AUDIT_GRPC_PORT: positiveInteger(
    'AUDIT_GRPC_PORT',
    50060,
  ),
});

module.exports = env;