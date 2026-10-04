'use strict';
const { startService } = require('../../../shared/grpc/service-server');
const { createLogger } = require('../../../shared/logging/logger');
const database = require('./config/database');
const { createNotificationGrpcHandlers } = require('./grpc/notification.grpc');
const { consumeEvents } = require('../../../shared/rabbitmq/consumer');
const { createChannel,closeConnection } = require('../../../shared/rabbitmq/connection');
const { closePublisher } = require('../../../shared/rabbitmq/publisher');
const { handleNotificationEvent } = require('./events/business-events.consumer');
let consumer;
const dependencies = { ...database,async checkDatabase() {
  await database.checkDatabase(); const channel = await createChannel(); await channel.close();
} };

startService({
  name:'notification-service',protoFile:'notification.proto',packageName:'cab.notification.v1',serviceName:'NotificationService',
  handlers:createNotificationGrpcHandlers(),database:dependencies,app:require('./app'),
  httpPort:Number(process.env.HTTP_PORT || 3007),grpcPort:Number(process.env.NOTIFICATION_GRPC_PORT || 50057),
  async onStart() { await database.ensureIndexes();
    consumer = await consumeEvents({ serviceName:'notification-service',queue:'cab.notification.q',
      routingKeys:['offer.created','driver.approval.changed','trip.status.changed','trip.canceled','payment.completed'],handlerManagesIdempotency:true,handler:handleNotificationEvent });
  },
  async onStop() { if (consumer) await consumer.close(); await closePublisher(); await closeConnection();  },
}).catch(error => { createLogger('notification-service').error('Startup failed',{ error }); process.exit(1); });
