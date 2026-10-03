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
  checkRabbitMq,
  closeRabbitMq,
} = require(
  './events/rabbitmq'
);

const {
  createBookingGrpcHandlers,
} = require(
  './grpc/booking.grpc'
);

const customerClient =
  require(
    './grpc/customer.client'
  );

const driverClient =
  require(
    './grpc/driver.client'
  );

const driverMatchingService =
  require(
    './services/driver-matching.service'
  );

const logger =
  createLogger(
    'booking-service',
  );

const HTTP_HOST =
  process.env.HTTP_HOST ||
  '0.0.0.0';

const HTTP_PORT =
  Number(
    process.env.HTTP_PORT ||
    3004,
  );

const GRPC_HOST =
  process.env.GRPC_HOST ||
  '0.0.0.0';

const GRPC_PORT =
  Number(
    process.env.GRPC_PORT ||
    process.env
      .BOOKING_GRPC_PORT ||
    50054,
  );

const grpcServer =
  createServer();

grpcServer.addService(
  getServiceDefinition(
    'booking.proto',
    'cab.booking.v1',
    'BookingService',
  ),

  createBookingGrpcHandlers(),
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
          await Promise.all([
            checkDatabase(),
            checkRabbitMq(),
          ]);

          callback(
            null,
            {
              status:
                'healthy',

              detail:
                'postgres and rabbitmq ready',
            },
          );
        } catch (_error) {
          callback(
            null,
            {
              status:
                'unhealthy',

              detail:
                'booking dependency unavailable',
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
        'Booking HTTP health server listening',
        {
          host:
            HTTP_HOST,

          port:
            HTTP_PORT,
        },
      );
    },
  );

grpcServer.bindAsync(
  `${GRPC_HOST}:${GRPC_PORT}`,

  grpc.ServerCredentials
    .createInsecure(),

  async (error) => {
    if (error) {
      logger.error(
        'Booking gRPC bind failed',
        { error },
      );

      process.exit(1);
    }

    grpcServer.start();

    logger.info(
      'Booking gRPC server listening',
      {
        host:
          GRPC_HOST,

        port:
          GRPC_PORT,
      },
    );

    /*
     * Restore timers / matching
     * after service restart.
     */
    try {
      await driverMatchingService
        .recoverMatchingState();

      logger.info(
        'Booking matching recovery completed',
      );
    } catch (recoveryError) {
      logger.error(
        'Booking matching recovery failed',
        {
          error:
            recoveryError,
        },
      );
    }
  },
);

let shuttingDown =
  false;

async function shutdown(
  signal,
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    'Booking service shutdown started',
    { signal },
  );

  driverMatchingService
    .stopAllOfferTimers();

  httpServer.close(
    () => {},
  );

  customerClient
    .closeCustomerClient();

  driverClient
    .closeDriverClient();

  try {
    await closeRabbitMq();
  } catch (error) {
    logger.warn(
      'Booking RabbitMQ close failed',
      { error },
    );
  }

  grpcServer.tryShutdown(
    async () => {
      try {
        await closeDatabase();

        logger.info(
          'Booking service shutdown completed',
        );

        process.exit(0);
      } catch (error) {
        logger.error(
          'Booking service shutdown failed',
          { error },
        );

        process.exit(1);
      }
    },
  );
}

process.on(
  'SIGTERM',
  () =>
    shutdown(
      'SIGTERM',
    ),
);

process.on(
  'SIGINT',
  () =>
    shutdown(
      'SIGINT',
    ),
);