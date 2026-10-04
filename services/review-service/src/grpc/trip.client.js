'use strict';
const { unaryClient } = require('../../../../shared/grpc/unary-client');
const client = unaryClient({ name:'trip',port:50055 });
function validateCompletedTrip(tripId, correlationId) { return client.call('validateCompletedTrip',{ tripId,correlationId }); }
module.exports = { validateCompletedTrip,close:client.close };
