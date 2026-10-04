'use strict';
const { startService } = require('../../../shared/grpc/service-server');
const { createLogger } = require('../../../shared/logging/logger');
const database = require('./config/database');
const rabbitmq = require('./events/rabbitmq');
const { createBookingGrpcHandlers } = require('./grpc/booking.grpc');
const customer = require('./grpc/customer.client');
const driver = require('./grpc/driver.client');
const dependencies = { ...database, async checkDatabase() {
  await Promise.all([database.checkDatabase(), rabbitmq.checkRabbitMq()]);
} };
startService({
  name: 'booking-service', protoFile: 'booking.proto', packageName: 'cab.booking.v1', serviceName: 'BookingService',
  handlers: createBookingGrpcHandlers(), database: dependencies, app: require('./app'),
  httpPort: Number(process.env.HTTP_PORT || 3004),
  grpcPort: Number(process.env.GRPC_PORT || process.env.BOOKING_GRPC_PORT || 50054),
  async onStop() { customer.closeCustomerClient(); driver.closeDriverClient(); await rabbitmq.closeRabbitMq(); },
}).catch((error) => { createLogger('booking-service').error('Startup failed', { error }); process.exit(1); });
