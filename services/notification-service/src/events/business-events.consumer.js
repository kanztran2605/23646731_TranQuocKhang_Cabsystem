'use strict';
const service = require('../services/notification.service');
async function handleNotificationEvent(event) { return service.consume(event); }
module.exports = { handleNotificationEvent };
