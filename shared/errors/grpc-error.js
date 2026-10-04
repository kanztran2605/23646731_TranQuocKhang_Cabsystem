'use strict';

const { status } = require('@grpc/grpc-js');
const { AppError } = require('./app-error');

function grpcToAppError(error) {
  if (error instanceof AppError) return error;
  switch (error?.code) {
    case status.INVALID_ARGUMENT:
    case status.OUT_OF_RANGE:
      return AppError.badRequest();
    case status.UNAUTHENTICATED:
      return AppError.unauthorized();
    case status.PERMISSION_DENIED:
      return AppError.forbidden();
    case status.NOT_FOUND:
      return AppError.notFound();
    case status.ALREADY_EXISTS:
    case status.FAILED_PRECONDITION:
    case status.ABORTED:
      return AppError.conflict();
    case status.RESOURCE_EXHAUSTED:
      return AppError.tooManyRequests();
    case status.UNAVAILABLE:
      return new AppError('Downstream service unavailable', { code: 'SERVICE_UNAVAILABLE', statusCode: 503 });
    case status.DEADLINE_EXCEEDED:
      return new AppError('Downstream request timed out', { code: 'SERVICE_TIMEOUT', statusCode: 504 });
    case status.UNIMPLEMENTED:
      return new AppError('Downstream method is pending', { code: 'SERVICE_NOT_IMPLEMENTED', statusCode: 502 });
    default:
      return AppError.internal();
  }
}

module.exports = { grpcToAppError };
