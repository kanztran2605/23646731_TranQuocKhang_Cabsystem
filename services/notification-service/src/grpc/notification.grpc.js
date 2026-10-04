'use strict';
const service = require('../services/notification.service');
const { handlers } = require('../../../../shared/grpc/handlers');
function createNotificationGrpcHandlers(operations = service) { return handlers(operations,['listNotifications']); }
module.exports = { createNotificationGrpcHandlers };
