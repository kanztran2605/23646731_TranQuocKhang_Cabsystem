'use strict';
const { handlers } = require('../../../../shared/grpc/handlers');
const service = require('../services/auth.service');
function createAuthGrpcHandlers(implementation = service) { return handlers(implementation, ['createAccount', 'login']); }
module.exports = { createAuthGrpcHandlers };
