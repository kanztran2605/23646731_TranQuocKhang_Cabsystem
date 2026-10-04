'use strict';
const { grpc } = require('./loader');
const { AppError } = require('../errors/app-error');
function unary(handler) {
  return async (call, callback) => {
    try { callback(null, await handler(call.request)); }
    catch (error) {
      const map = { 400: grpc.status.INVALID_ARGUMENT, 401: grpc.status.UNAUTHENTICATED,
        403: grpc.status.PERMISSION_DENIED, 404: grpc.status.NOT_FOUND,
        409: error.code === 'ALREADY_EXISTS' ? grpc.status.ALREADY_EXISTS : grpc.status.FAILED_PRECONDITION,
        429: grpc.status.RESOURCE_EXHAUSTED, 503: grpc.status.UNAVAILABLE,
        504: grpc.status.DEADLINE_EXCEEDED };
      callback({
        code: error instanceof AppError ? map[error.statusCode] || grpc.status.INTERNAL : grpc.status.INTERNAL,
        details: error instanceof AppError && error.expose ? error.message : 'Internal service error',
      });
    }
  };
}
function handlers(service, names) { return Object.fromEntries(names.map((name) => [name, unary(service[name])])); }
function health(check) {
  return { check: async (_call, callback) => {
    try { await check(); callback(null, { status: 'UP' }); }
    catch (_error) { callback(null, { status: 'DOWN' }); }
  } };
}
module.exports = { unary, handlers, health };
