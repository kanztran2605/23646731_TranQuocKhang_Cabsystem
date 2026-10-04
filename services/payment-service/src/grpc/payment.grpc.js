'use strict';
const service = require('../services/payment.service');
const { handlers } = require('../../../../shared/grpc/handlers');
function createPaymentGrpcHandlers(operations = service) {
  return handlers(operations,['getPayment','getPaymentByBooking','payExistingPayment','paymentCallback']);
}
module.exports = { createPaymentGrpcHandlers };
