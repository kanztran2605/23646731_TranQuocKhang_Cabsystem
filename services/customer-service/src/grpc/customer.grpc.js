'use strict';
const { handlers } = require('../../../../shared/grpc/handlers');
const service = require('../services/customer.service');
function createCustomerGrpcHandlers(implementation = service) {
  return handlers(implementation, ['createCustomerProfile', 'getCustomer', 'getCustomerByUserId', 'validateCustomer']);
}
module.exports = { createCustomerGrpcHandlers };
