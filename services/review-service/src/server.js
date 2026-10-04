'use strict';
const { startService } = require('../../../shared/grpc/service-server');
const { createLogger } = require('../../../shared/logging/logger');
const database = require('./config/database');
const { createReviewGrpcHandlers } = require('./grpc/review.grpc');
const dependencies = database;
const client = require('./grpc/trip.client');
startService({
  name:'review-service',protoFile:'review.proto',packageName:'cab.review.v1',serviceName:'ReviewService',
  handlers:createReviewGrpcHandlers(),database:dependencies,app:require('./app'),
  httpPort:Number(process.env.HTTP_PORT || 3008),grpcPort:Number(process.env.REVIEW_GRPC_PORT || 50058),

  async onStop() {  client.close(); },
}).catch(error => { createLogger('review-service').error('Startup failed',{ error }); process.exit(1); });
