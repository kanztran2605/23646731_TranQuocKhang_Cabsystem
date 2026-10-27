'use strict';
const { unaryClient } = require('../../../../shared/grpc/unary-client');
const client = unaryClient({ name: 'driver', port: 50053 });
function getDriverLocation(driverId, correlationId) { return client.call('getDriverLocation', { driverId, correlationId }); }
function getAssignedDriver(driverId,vehicleId,correlationId) { return client.call('getAssignedDriver',{ driverId,vehicleId,correlationId }); }
module.exports = { getDriverLocation, getAssignedDriver, close: client.close };
