'use strict';

const express =
  require('express');

const helmet =
  require('helmet');

const cors =
  require('cors');

const env =
  require(
    './config/env'
  );

const healthRoutes =
  require(
    './routes/health.routes'
  );

const authRoutes =
  require(
    './routes/auth.routes'
  );

const {
  AppError,
} = require(
  '../../../shared/errors/app-error'
);

const {
  correlationMiddleware,
} = require(
  './middleware/correlation.middleware'
);

const {
  apiRateLimit,
} = require(
  './middleware/rate-limit.middleware'
);

const {
  notFoundHandler,
  errorHandler,
} = require(
  './middleware/error.middleware'
);

const app =
  express();

app.disable(
  'x-powered-by',
);

app.use(
  correlationMiddleware,
);

app.use(
  helmet(),
);

app.use(
  cors({
    origin(
      origin,
      callback,
    ) {
      if (
        !origin ||
        env.CORS_ORIGINS
          .includes(
            origin,
          )
      ) {
        callback(
          null,
          true,
        );

        return;
      }

      callback(
        AppError.forbidden(
          'Origin is not allowed by CORS',
          'CORS_FORBIDDEN',
        ),
      );
    },

    credentials: true,
  }),
);

app.use(
  express.json({
    limit: '1mb',
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '1mb',
  }),
);

/*
 * Health is outside /api/v1.
 */
app.use(
  healthRoutes,
);

/*
 * Every external business request
 * passes through Gateway rate limit.
 */
app.use(
  '/api/v1',
  apiRateLimit,
);

/*
 * REST -> gRPC orchestration.
 */
app.use(
  '/api/v1/auth',
  authRoutes,
);

/*
 * Other business routes are added
 * only when the owning service is
 * implemented.
 */
app.use(
  notFoundHandler,
);

app.use(
  errorHandler,
);

module.exports = app;