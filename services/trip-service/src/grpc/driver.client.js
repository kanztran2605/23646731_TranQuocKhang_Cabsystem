'use strict';
const { unaryClient } = require('../../../../shared/grpc/unary-client');
const client = unaryClient({ name: 'driver', port: 50053 });
function getDriverLocation(driverId, correlationId) { return client.call('getDriverLocation', { driverId, correlationId }); }
module.exports = { getDriverLocation, close: client.close };
