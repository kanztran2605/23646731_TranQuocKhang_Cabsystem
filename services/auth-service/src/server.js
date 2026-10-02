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
  createAuthGrpcHandlers,
} = require(
  './grpc/auth.grpc'
);

const logger =
  createLogger(
    'auth-service',
  );

const HTTP_HOST =
  process.env.HTTP_HOST ||
  '0.0.0.0';

const HTTP_PORT =
  Number(
    process.env.HTTP_PORT ||
    3001,
  );

const GRPC_HOST =
  process.env.GRPC_HOST ||
  '0.0.0.0';

const GRPC_PORT =
  Number(
    process.env
      .AUTH_GRPC_PORT ||
    50051,
  );

const grpcServer =
  createServer();

grpcServer.addService(
  getServiceDefinition(
    'auth.proto',
    'cab.auth.v1',
    'AuthService',
  ),

  createAuthGrpcHandlers(),
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
        'Auth HTTP health server listening',
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
        'Auth gRPC bind failed',
        { error },
      );

      process.exit(1);
    }

    grpcServer.start();

    logger.info(
      'Auth gRPC server listening',
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
    'Auth service shutdown started',
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
          'Auth service shutdown completed',
        );

        process.exit(0);
      } catch (error) {
        logger.error(
          'Auth service shutdown failed',
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