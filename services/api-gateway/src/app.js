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

const driverRoutes =
  require(
    './routes/driver.routes'
  );

const vehicleRoutes =
  require(
    './routes/vehicle.routes'
  );

const bookingRoutes =
  require(
    './routes/booking.routes'
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

/*
 * Root health endpoints:
 * /health
 * /ready
 * /health/services
 */
app.use(
  healthRoutes,
);

/*
 * Rate limit for all
 * external business APIs.
 */
app.use(
  '/api/v1',
  apiRateLimit,
);

/*
 * Authentication APIs.
 */
app.use(
  '/api/v1/auth',
  authRoutes,
);

/*
 * Customer/User Profile APIs.
 */
app.use(
  '/api/v1/users',
  customerRoutes,
);

/*
 * Driver APIs.
 */
app.use(
  '/api/v1/drivers',
  driverRoutes,
);

/*
 * Vehicle APIs.
 *
 * vehicle.routes.js contains:
 * /vehicle-types
 * /vehicles
 * /vehicles/:vehicleId
 */
app.use(
  '/api/v1',
  vehicleRoutes,
);

/*
 * Booking APIs.
 *
 * booking.routes.js contains:
 * /bookings
 * /bookings/:bookingId
 * /customers/me/bookings
 * /drivers/me/offers
 * /driver-offers/:offerId/accept
 * /driver-offers/:offerId/reject
 */
app.use(
  '/api/v1',
  bookingRoutes,
);

/*
 * Must stay AFTER all routes.
 */
app.use(
  notFoundHandler,
);

app.use(
  errorHandler,
);

module.exports = app;