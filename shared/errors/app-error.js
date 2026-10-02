'use strict';

class AppError extends Error {
  constructor(message, options = {}) {
    const {
      code = 'INTERNAL_ERROR',
      statusCode = 500,
      details,
      expose = statusCode < 500,
      cause,
    } = options;

    super(message || 'Internal server error', { cause });

    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expose = expose;
    this.isOperational = true;

    Error.captureStackTrace?.(this, AppError);
  }

  toResponse() {
    return {
      code: this.code,
      message: this.expose
        ? this.message
        : 'Internal server error',
      timestamp: new Date().toISOString(),
    };
  }

  static badRequest(
    message = 'Request data is invalid',
    code = 'INVALID_REQUEST',
    details,
  ) {
    return new AppError(message, {
      code,
      statusCode: 400,
      details,
    });
  }

  static unauthorized(
    message = 'Authentication is required',
    code = 'UNAUTHORIZED',
  ) {
    return new AppError(message, {
      code,
      statusCode: 401,
    });
  }

  static forbidden(
    message = 'Access is forbidden',
    code = 'FORBIDDEN',
  ) {
    return new AppError(message, {
      code,
      statusCode: 403,
    });
  }

  static notFound(
    message = 'Resource not found',
    code = 'NOT_FOUND',
  ) {
    return new AppError(message, {
      code,
      statusCode: 404,
    });
  }

  static conflict(
    message = 'Resource conflict',
    code = 'CONFLICT',
    details,
  ) {
    return new AppError(message, {
      code,
      statusCode: 409,
      details,
    });
  }

  static tooManyRequests(
    message = 'Too many requests',
    code = 'RATE_LIMITED',
  ) {
    return new AppError(message, {
      code,
      statusCode: 429,
    });
  }

  static internal(
    message = 'Internal server error',
    code = 'INTERNAL_ERROR',
    cause,
  ) {
    return new AppError(message, {
      code,
      statusCode: 500,
      expose: false,
      cause,
    });
  }
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  return AppError.internal(
    'Internal server error',
    'INTERNAL_ERROR',
    error,
  );
}

module.exports = {
  AppError,
  normalizeError,
};