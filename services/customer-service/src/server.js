'use strict';
const { startService } = require('../../../shared/grpc/service-server');
const { createLogger } = require('../../../shared/logging/logger');
const database = require('./config/database');
const { createCustomerGrpcHandlers } = require('./grpc/customer.grpc');
startService({
  name: 'customer-service',protoFile: 'customer.proto',packageName: 'cab.customer.v1',serviceName: 'CustomerService',
  handlers: createCustomerGrpcHandlers(),database,app: require('./app'),
  httpPort: Number(process.env.HTTP_PORT || 3002),grpcPort: Number(process.env.CUSTOMER_GRPC_PORT || 50052),
}).catch((error) => { createLogger('customer-service').error('Startup failed',{ error }); process.exit(1); });
