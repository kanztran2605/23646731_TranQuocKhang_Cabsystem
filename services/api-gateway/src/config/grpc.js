'use strict';

const env = require('./env');

const SERVICE_DEFINITIONS = Object.freeze({
  auth: Object.freeze({
    key: 'auth',
    name: 'auth-service',
    protoFile: 'auth.proto',
    packageName: 'cab.auth.v1',
    serviceName: 'AuthService',
    host: env.AUTH_GRPC_HOST,
    port: env.AUTH_GRPC_PORT,
  }),

  customer: Object.freeze({
    key: 'customer',
    name: 'customer-service',
    protoFile: 'customer.proto',
    packageName: 'cab.customer.v1',
    serviceName: 'CustomerService',
    host: env.CUSTOMER_GRPC_HOST,
    port: env.CUSTOMER_GRPC_PORT,
  }),

  driver: Object.freeze({
    key: 'driver',
    name: 'driver-service',
    protoFile: 'driver.proto',
    packageName: 'cab.driver.v1',
    serviceName: 'DriverService',
    host: env.DRIVER_GRPC_HOST,
    port: env.DRIVER_GRPC_PORT,
  }),

  booking: Object.freeze({
    key: 'booking',
    name: 'booking-service',
    protoFile: 'booking.proto',
    packageName: 'cab.booking.v1',
    serviceName: 'BookingService',
    host: env.BOOKING_GRPC_HOST,
    port: env.BOOKING_GRPC_PORT,
  }),

  trip: Object.freeze({
    key: 'trip',
    name: 'trip-service',
    protoFile: 'trip.proto',
    packageName: 'cab.trip.v1',
    serviceName: 'TripService',
    host: env.TRIP_GRPC_HOST,
    port: env.TRIP_GRPC_PORT,
  }),

  payment: Object.freeze({
    key: 'payment',
    name: 'payment-service',
    protoFile: 'payment.proto',
    packageName: 'cab.payment.v1',
    serviceName: 'PaymentService',
    host: env.PAYMENT_GRPC_HOST,
    port: env.PAYMENT_GRPC_PORT,
  }),

  notification: Object.freeze({
    key: 'notification',
    name: 'notification-service',
    protoFile: 'notification.proto',
    packageName: 'cab.notification.v1',
    serviceName: 'NotificationService',
    host: env.NOTIFICATION_GRPC_HOST,
    port: env.NOTIFICATION_GRPC_PORT,
  }),

  review: Object.freeze({
    key: 'review',
    name: 'review-service',
    protoFile: 'review.proto',
    packageName: 'cab.review.v1',
    serviceName: 'ReviewService',
    host: env.REVIEW_GRPC_HOST,
    port: env.REVIEW_GRPC_PORT,
  }),
});

function getServiceDefinition(serviceKey) {
  const definition = SERVICE_DEFINITIONS[serviceKey];

  if (!definition) {
    throw new Error(
      `Unknown gRPC service key: ${serviceKey}`,
    );
  }

  return definition;
}

function getServiceAddress(serviceKey) {
  const service = getServiceDefinition(serviceKey);

  return `${service.host}:${service.port}`;
}

module.exports = {
  SERVICE_DEFINITIONS,
  getServiceDefinition,
  getServiceAddress,
};