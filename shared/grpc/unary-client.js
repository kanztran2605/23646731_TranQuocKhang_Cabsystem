'use strict';
const { grpc, createClient } = require('./loader');
const { grpcToAppError } = require('../errors/grpc-error');
const { normalizeCorrelationId } = require('../correlation');
function unaryClient({ name, port }) {
  let client;
  return {
    async call(method, request) {
      if (!client) client = createClient({ protoFile: name + '.proto', packageName: 'cab.' + name + '.v1',
        serviceName: name[0].toUpperCase() + name.slice(1) + 'Service',
        address: (process.env[name.toUpperCase() + '_GRPC_HOST'] || name + '-service') + ':' + (process.env[name.toUpperCase() + '_GRPC_PORT'] || port) });
      const metadata = new grpc.Metadata();
      const correlation = normalizeCorrelationId(request.correlationId || request.context?.correlationId);
      if (correlation) metadata.set('x-correlation-id', correlation);
      try {
        return await new Promise((resolve, reject) => client[method](request, metadata,
          { deadline: new Date(Date.now() + 2000) }, (error, response) => error ? reject(error) : resolve(response)));
      } catch (error) { throw grpcToAppError(error); }
    },
    close() { client?.close(); client = undefined; },
  };
}
module.exports = { unaryClient };
