'use strict';
const { startService } = require('../../../shared/grpc/service-server');
const { createLogger } = require('../../../shared/logging/logger');
const database = require('./config/database');
const { createPaymentGrpcHandlers } = require('./grpc/payment.grpc');
const { consumeEvents } = require('../../../shared/rabbitmq/consumer');
const { createChannel,closeConnection } = require('../../../shared/rabbitmq/connection');
const { closePublisher } = require('../../../shared/rabbitmq/publisher');
const { handlePaymentEvent } = require('./events/trip-completed.consumer');
let consumer;
const dependencies = { ...database,async checkDatabase() {
  await database.checkDatabase(); const channel = await createChannel(); await channel.close();
} };

startService({
  name:'payment-service',protoFile:'payment.proto',packageName:'cab.payment.v1',serviceName:'PaymentService',
  handlers:createPaymentGrpcHandlers(),database:dependencies,app:require('./app'),
  httpPort:Number(process.env.HTTP_PORT || 3006),grpcPort:Number(process.env.PAYMENT_GRPC_PORT || 50056),
  async onStart() {
    consumer = await consumeEvents({ serviceName:'payment-service',queue:'cab.payment.q',
      routingKeys:['booking.created','trip.completed'],handlerManagesIdempotency:true,handler:handlePaymentEvent });
  },
  async onStop() { if (consumer) await consumer.close(); await closePublisher(); await closeConnection();  },
}).catch(error => { createLogger('payment-service').error('Startup failed',{ error }); process.exit(1); });
