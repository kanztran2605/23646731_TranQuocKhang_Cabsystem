'use strict';
const { startService } = require('../../../shared/grpc/service-server');
const { createLogger } = require('../../../shared/logging/logger');
const database = require('./config/database');
const { createAuthGrpcHandlers } = require('./grpc/auth.grpc');
startService({
  name: 'auth-service',protoFile: 'auth.proto',packageName: 'cab.auth.v1',serviceName: 'AuthService',
  handlers: createAuthGrpcHandlers(),database,app: require('./app'),
  httpPort: Number(process.env.HTTP_PORT || 3001),grpcPort: Number(process.env.AUTH_GRPC_PORT || 50051),
}).catch((error) => { createLogger('auth-service').error('Startup failed',{ error }); process.exit(1); });
