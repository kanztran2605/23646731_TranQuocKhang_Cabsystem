'use strict';
const { unaryClient } = require('../../../../shared/grpc/unary-client');
const client = unaryClient({ name: 'customer', port: 50052 });
function getCustomerByUserId(userId, correlationId) { return client.call('getCustomerByUserId', { userId: String(userId), correlationId }); }
function validateCustomer(customerId, correlationId) { return client.call('validateCustomer', { customerId: String(customerId), correlationId }); }
function closeCustomerClient() { client.close(); }
module.exports = { getCustomerByUserId, validateCustomer, closeCustomerClient };
