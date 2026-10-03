'use strict';

const app =
  require('./app');

const {
  grpc,
  createServer,
  getServiceDefinition,
} = require(
  '../../../shared/grpc/loader'
);

const {
  consumeEvents,
} = require(
  '../../../shared/rabbitmq/consumer'
);

const {
  closeConnection,
} = require(
  '../../../shared/rabbitmq/connection'
);

const {
  createLogger,
} = require(
  '../../../shared/logging/logger'
);

const {
  checkDatabase,
  closeDatabase,
} = require(
  './config/database'
);

const {
  createDriverGrpcHandlers,
} = require(
  './grpc/driver.grpc'
);

const {
  handleDriverAccepted,
} = require(
  './events/driver-accepted.consumer'
);

const {
  handleTripStatusChanged,
  handleTripCanceled,
} = require(
  './events/trip-events.consumer'
);

const logger =
  createLogger(
    'driver-service',
  );

const HTTP_HOST =
  process.env.HTTP_HOST ||
  '0.0.0.0';

const HTTP_PORT =
  Number(
    process.env.HTTP_PORT ||
    3003,
  );

const GRPC_HOST =
  process.env.GRPC_HOST ||
  '0.0.0.0';

const GRPC_PORT =
  Number(
    process.env.GRPC_PORT ||
    process.env.DRIVER_GRPC_PORT ||
    50053,
  );

const grpcServer =
  createServer();

grpcServer.addService(
  getServiceDefinition(
    'driver.proto',
    'cab.driver.v1',
    'DriverService',
  ),
  createDriverGrpcHandlers(),
);

grpcServer.addService(
  getServiceDefinition(
    'common/common.proto',
    'cab.common.v1',
    'HealthService',
  ),
  {
    check:
      async (
        _call,
        callback,
      ) => {
        try {
          await checkDatabase();

          callback(
            null,
            {
              status:
                'healthy',
              detail:
                'postgres ready',
            },
          );
        } catch (_error) {
          callback(
            null,
            {
              status:
                'unhealthy',
              detail:
                'postgres unavailable',
            },
          );
        }
      },
  },
);

const httpServer =
  app.listen(
    HTTP_PORT,
    HTTP_HOST,
    () => {
      logger.info(
        'Driver HTTP health server listening',
        {
          host: HTTP_HOST,
          port: HTTP_PORT,
        },
      );
    },
  );

let eventConsumer = null;
let shuttingDown = false;

async function startEventConsumer() {
  eventConsumer =
    await consumeEvents({
      serviceName:
        'driver-service',
      queue:
        'cab.driver-service.events',

      routingKeys: [
        'driver.accepted',
        'trip.status.changed',
        'trip.canceled',
      ],

      handlerManagesIdempotency:
        true,

      handler:
        async (event) => {
          switch (event.eventType) {
            case 'driver.accepted':
              await handleDriverAccepted(
                event,
              );
              return;

            case 'trip.status.changed':
              await handleTripStatusChanged(
                event,
              );
              return;

            case 'trip.canceled':
              await handleTripCanceled(
                event,
              );
              return;

            default:
              return;
          }
        },
    });
}

grpcServer.bindAsync(
  `${GRPC_HOST}:${GRPC_PORT}`,
  grpc.ServerCredentials
    .createInsecure(),

  async (error) => {
    if (error) {
      logger.error(
        'Driver gRPC bind failed',
        { error },
      );

      process.exit(1);
    }

    grpcServer.start();

    logger.info(
      'Driver gRPC server listening',
      {
        host: GRPC_HOST,
        port: GRPC_PORT,
      },
    );

    try {
      await startEventConsumer();
    } catch (consumerError) {
      logger.error(
        'Driver RabbitMQ consumer failed to start',
        {
          error:
            consumerError,
        },
      );
    }
  },
);

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    'Driver service shutdown started',
    { signal },
  );

  httpServer.close(
    () => {},
  );

  if (eventConsumer) {
    try {
      await eventConsumer.close();
    } catch (error) {
      logger.warn(
        'Driver RabbitMQ consumer close failed',
        { error },
      );
    }
  }

  try {
    await closeConnection();
  } catch (error) {
    logger.warn(
      'Driver RabbitMQ connection close failed',
      { error },
    );
  }

  grpcServer.tryShutdown(
    async () => {
      try {
        await closeDatabase();

        logger.info(
          'Driver service shutdown completed',
        );

        process.exit(0);
      } catch (error) {
        logger.error(
          'Driver service shutdown failed',
          { error },
        );

        process.exit(1);
      }
    },
  );
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM'),
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT'),
);