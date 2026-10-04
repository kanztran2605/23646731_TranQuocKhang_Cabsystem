'use strict';
const sanitizeHtml = require('sanitize-html');
const repository = require('../repositories/review.repository');
const tripClient = require('../grpc/trip.client');
const { toReview } = require('../domain/review');
const { id, actor } = require('../../../../shared/validation');
const { AppError } = require('../../../../shared/errors/app-error');
function createReviewService({ repo = repository,trip = tripClient } = {}) {
  return {
    async createReview(request) {
      const uid = actor(request.context,['CUSTOMER']), tripId = id(request.tripId);
      if (!Number.isInteger(request.score) || request.score < 1 || request.score > 5) throw AppError.badRequest('Invalid review score');
      if (request.comment !== undefined && (typeof request.comment !== 'string' || request.comment.length > 255)) throw AppError.badRequest('Invalid review comment');
      const validation = await trip.validateCompletedTrip(tripId,request.context.correlationId);
      if (validation.tripId !== tripId || uid !== validation.customerUserId ||
          (request.context.actorCustomerId && id(request.context.actorCustomerId) !== validation.customerId)) throw AppError.forbidden();
      if (!validation.completed || validation.status !== 'COMPLETED') throw AppError.conflict('Trip must be completed');
      const input = { tripId,customerId:id(validation.customerId),driverId:id(validation.driverId),score:request.score,
        ...(request.comment !== undefined ? { comment:sanitizeHtml(request.comment,{ allowedTags:[],allowedAttributes:{} }) } : {}) };
      try { return toReview(await repo.create(input)); }
      catch (error) { if (error.code === '23505') throw AppError.conflict('Trip already reviewed','ALREADY_EXISTS'); throw error; }
    },
  };
}
module.exports = { ...createReviewService(),createReviewService };
