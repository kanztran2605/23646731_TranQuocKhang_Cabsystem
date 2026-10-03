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

const customerRoutes =
  require(
    './routes/customer.routes'
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
          .includes(origin)
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

app.use(
  healthRoutes,
);

app.use(
  '/api/v1',
  apiRateLimit,
);

app.use(
  '/api/v1/auth',
  authRoutes,
);

app.use(
  '/api/v1/users',
  customerRoutes,
);

app.use(
  notFoundHandler,
);

app.use(
  errorHandler,
);

module.exports = app;