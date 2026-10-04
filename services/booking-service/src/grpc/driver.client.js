'use strict';
const { unaryClient } = require('../../../../shared/grpc/unary-client');
const client = unaryClient({ name: 'driver', port: 50053 });
function findEligibleDrivers(input) { return client.call('findEligibleDrivers', input); }
function getMyDriverProfile(context) { return client.call('getDriverByUserId', { userId: String(context.actorUserId), correlationId: context.correlationId }); }
function markBusyForAssignment(context, driverId) { return client.call('markBusyForAssignment', { context, driverId: String(driverId) }); }
function closeDriverClient() { client.close(); }
module.exports = { findEligibleDrivers, getMyDriverProfile, markBusyForAssignment, closeDriverClient };
