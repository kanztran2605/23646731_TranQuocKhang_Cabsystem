'use strict';
const service = require('../services/review.service');
const { handlers } = require('../../../../shared/grpc/handlers');
function createReviewGrpcHandlers(operations = service) { return handlers(operations,['createReview']); }
module.exports = { createReviewGrpcHandlers };
