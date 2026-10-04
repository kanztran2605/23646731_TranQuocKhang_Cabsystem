'use strict';
const { startService } = require('../../../shared/grpc/service-server');
const { createLogger } = require('../../../shared/logging/logger');
const database = require('./config/database');
const { createTripGrpcHandlers } = require('./grpc/trip.grpc');
const { consumeEvents } = require('../../../shared/rabbitmq/consumer');
const { createChannel,closeConnection } = require('../../../shared/rabbitmq/connection');
const { closePublisher } = require('../../../shared/rabbitmq/publisher');
const { handleTripEvent } = require('./events/driver-accepted.consumer');
let consumer;
const dependencies = { ...database,async checkDatabase() {
  await database.checkDatabase(); const channel = await createChannel(); await channel.close();
} };
const client = require('./grpc/driver.client');
startService({
  name:'trip-service',protoFile:'trip.proto',packageName:'cab.trip.v1',serviceName:'TripService',
  handlers:createTripGrpcHandlers(),database:dependencies,app:require('./app'),
  httpPort:Number(process.env.HTTP_PORT || 3005),grpcPort:Number(process.env.TRIP_GRPC_PORT || 50055),
  async onStart() {
    consumer = await consumeEvents({ serviceName:'trip-service',queue:'cab.trip.q',
      routingKeys:['driver.accepted','payment.completed'],handlerManagesIdempotency:true,handler:handleTripEvent });
  },
  async onStop() { if (consumer) await consumer.close(); await closePublisher(); await closeConnection(); client.close(); },
}).catch(error => { createLogger('trip-service').error('Startup failed',{ error }); process.exit(1); });
