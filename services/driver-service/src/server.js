'use strict';
const { startService } = require('../../../shared/grpc/service-server');
const { createLogger } = require('../../../shared/logging/logger');
const database = require('./config/database');
const { createDriverGrpcHandlers } = require('./grpc/driver.grpc');
const { consumeEvents } = require('../../../shared/rabbitmq/consumer');
const { closeConnection } = require('../../../shared/rabbitmq/connection');
const { handleTripEvent } = require('./events/trip-events.consumer');
let consumer;
startService({
  name: 'driver-service',protoFile: 'driver.proto',packageName: 'cab.driver.v1',serviceName: 'DriverService',
  handlers: createDriverGrpcHandlers(),database,app: require('./app'),
  httpPort: Number(process.env.HTTP_PORT || 3003),grpcPort: Number(process.env.DRIVER_GRPC_PORT || 50053),
  async onStart() {
    consumer = await consumeEvents({ serviceName: 'driver-service',queue: 'cab.driver.q',
      routingKeys: ['trip.completed','trip.canceled'],handlerManagesIdempotency: true,handler: handleTripEvent });
  },
  async onStop() { if (consumer) await consumer.close(); await closeConnection(); },
}).catch((error) => { createLogger('driver-service').error('Startup failed',{ error }); process.exit(1); });
