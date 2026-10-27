'use strict';
const repository = require('../repositories/payment.repository');
const database = require('../config/database');
const { publishPaymentCompleted } = require('../events/payment.publisher');
const { toPayment } = require('../domain/payment');
const { checkKey } = require('./idempotency.service');
const { AppError } = require('../../../../shared/errors/app-error');
const { id, text, actor } = require('../../../../shared/validation');
function createPaymentService({ repo = repository, transaction = database.withTransaction, publish = publishPaymentCompleted } = {}) {
  function found(row) { if (!row) throw AppError.notFound('Payment does not exist'); return row; }
  function own(context, row, roles = ['CUSTOMER','ADMIN']) {
    const user = actor(context,roles);
    if (context.actorRole !== 'ADMIN' && (String(row.customer_uid) !== user ||
        (context.actorCustomerId && String(row.cid) !== id(context.actorCustomerId)))) throw AppError.forbidden();
  }
  return {
    async bookingCreated(payload) {
      for (const field of ['bookingId','customerId','customerUserId']) id(payload[field]);
      if (!Number.isFinite(Date.parse(payload.createdAt))) throw AppError.badRequest('Invalid Booking timestamp');
      return transaction(async client => {
        const created = await repo.create(payload,client);
        const row = created || found(await repo.byBooking(payload.bookingId,client));
        if (String(row.cid) !== payload.customerId || String(row.customer_uid) !== payload.customerUserId) throw AppError.conflict('Conflicting Booking event');
        return toPayment(row);
      });
    },
    async tripCompleted(payload) {
      for (const field of ['bookingId','tripId','customerId','customerUserId']) id(payload[field]);
      return transaction(async client => {
        const row = found(await repo.lockByBooking(payload.bookingId,client));
        if (String(row.cid) !== payload.customerId || String(row.customer_uid) !== payload.customerUserId ||
            (row.tid != null && String(row.tid) !== payload.tripId)) throw AppError.conflict('Trip does not match Payment');
        return toPayment(row.eligible ? row : await repo.eligible(row.pid,payload.tripId,client));
      });
    },
    async getPayment(request) {
      actor(request.context,['CUSTOMER','ADMIN']);
      const row = found(await repo.byId(id(request.paymentId))); own(request.context,row); return toPayment(row);
    },
    async getPaymentByBooking(request) {
      actor(request.context,['CUSTOMER','ADMIN']);
      const row = found(await repo.byBooking(id(request.bookingId))); own(request.context,row); return toPayment(row);
    },
    async payExistingPayment(request) {
      actor(request.context,['CUSTOMER']); const key = text(request.idempotencyKey,100);
      try {
        return await transaction(async client => {
          const row = found(await repo.lock(id(request.paymentId),client)); own(request.context,row,['CUSTOMER']);
          const amount = request.amount ?? Number(row.amt);
          if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw AppError.badRequest();
          const payRequest = { paymentId:String(row.pid),amount };
          if (checkKey(row,key)) {
            if (row.pay_request && (row.pay_request.paymentId !== payRequest.paymentId || row.pay_request.amount !== amount)) throw AppError.conflict('Idempotency key đã dùng với nội dung khác');
            // Dữ liệu cũ không có snapshot giữ cách đọc cũ; giao dịch mới luôn lưu response đầu tiên.
            return row.pay_response || toPayment(row);
          }
          if (amount !== Number(row.amt)) throw AppError.badRequest('Số tiền không khớp Payment');
          if (row.s !== 'PENDING' || !row.eligible) throw AppError.conflict('Payment must be pending and eligible');
          const response = toPayment({ ...row,ikey:key });
          await repo.key(row.pid,key,payRequest,response,client);
          return response;
        });
      } catch (error) {
        if (error.code === '23505') throw AppError.conflict('Idempotency key already belongs to another Payment');
        throw error;
      }
    },
    async paymentCallback(request) {
      actor(request.context,['CUSTOMER','ADMIN']);
      if (request.status !== 'COMPLETED') throw AppError.badRequest('Invalid callback status');
      const result = await transaction(async client => {
        const row = found(await repo.lock(id(request.paymentId),client)); own(request.context,row);
        if (row.s === 'COMPLETED') return { row, replay:true };
        if (row.s !== 'PENDING' || !row.eligible || row.tid == null || !row.ikey || !row.pay_request || !row.pay_response) {
          throw AppError.conflict('Phải khởi tạo Pay hợp lệ trước callback');
        }
        return { row:await repo.complete(row.pid,new Date().toISOString(),client), replay:false };
      });
      if (!result.replay) {
        try { await publish({ ...result.row,correlationId:request.context.correlationId }); }
        catch (_error) { throw new AppError('Event publisher unavailable',{statusCode:503,code:'EVENT_PUBLISH_FAILED'}); }
      }
      return toPayment(result.row);
    },
  };
}
module.exports = { ...createPaymentService(), createPaymentService };
