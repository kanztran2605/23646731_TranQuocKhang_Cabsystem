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
  createCustomerGrpcHandlers,
} = require(
  './grpc/customer.grpc'
);

const logger =
  createLogger(
    'customer-service',
  );

const HTTP_HOST =
  process.env.HTTP_HOST ||
  '0.0.0.0';

const HTTP_PORT =
  Number(
    process.env.HTTP_PORT ||
    3002,
  );

const GRPC_HOST =
  process.env.GRPC_HOST ||
  '0.0.0.0';

const GRPC_PORT =
  Number(
    process.env
      .CUSTOMER_GRPC_PORT ||
    50052,
  );

const grpcServer =
  createServer();

grpcServer.addService(
  getServiceDefinition(
    'customer.proto',
    'cab.customer.v1',
    'CustomerService',
  ),

  createCustomerGrpcHandlers(),
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
        'Customer HTTP health server listening',
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

  (error) => {
    if (error) {
      logger.error(
        'Customer gRPC bind failed',
        { error },
      );

      process.exit(1);
    }

    grpcServer.start();

    logger.info(
      'Customer gRPC server listening',
      {
        host:
          GRPC_HOST,

        port:
          GRPC_PORT,
      },
    );
  },
);

let shuttingDown = false;

async function shutdown(
  signal,
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    'Customer service shutdown started',
    { signal },
  );

  httpServer.close(
    () => {},
  );

  grpcServer.tryShutdown(
    async () => {
      try {
        await closeDatabase();

        logger.info(
          'Customer service shutdown completed',
        );

        process.exit(0);
      } catch (error) {
        logger.error(
          'Customer service shutdown failed',
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