'use strict';

const app =
  require('./app');

const env =
  require('./config/env');

const {
  connectRedis,
  closeRedis,
} = require(
  './config/redis'
);

const {
  closeGrpcClients,
} = require(
  './clients/grpc-clients'
);

const {
  createLogger,
} = require(
  '../../../shared/logging/logger'
);

const logger =
  createLogger(
    env.SERVICE_NAME,
  );

const server =
  app.listen(
    env.API_GATEWAY_PORT,
    env.API_GATEWAY_HOST,

    () => {
      logger.info(
        'API Gateway listening',
        {
          host:
            env.API_GATEWAY_HOST,

          port:
            env.API_GATEWAY_PORT,
        },
      );
    },
  );

connectRedis()
  .catch((error) => {
    logger.error(
      'Initial Redis connection failed',
      { error },
    );
  });

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
    'API Gateway shutdown started',
    { signal },
  );

  const forceExitTimer =
    setTimeout(
      () => {
        logger.error(
          'API Gateway forced shutdown',
        );

        process.exit(1);
      },
      10000,
    );

  forceExitTimer.unref();

  server.close(
    async (
      serverError,
    ) => {
      try {
        closeGrpcClients();

        await closeRedis();

        if (serverError) {
          throw serverError;
        }

        logger.info(
          'API Gateway shutdown completed',
        );

        process.exit(0);
      } catch (error) {
        logger.error(
          'API Gateway shutdown failed',
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

process.on(
  'unhandledRejection',

  (reason) => {
    logger.error(
      'Unhandled promise rejection',
      {
        error:
          reason instanceof
          Error
            ? reason
            : new Error(
                String(
                  reason,
                ),
              ),
      },
    );
  },
);

process.on(
  'uncaughtException',

  (error) => {
    logger.error(
      'Uncaught exception',
      { error },
    );

    shutdown(
      'uncaughtException',
    );
  },
);