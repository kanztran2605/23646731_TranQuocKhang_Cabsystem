'use strict';
const { grpc, createServer, getServiceDefinition } = require('./loader');
const { health } = require('./handlers');
const { createLogger } = require('../logging/logger');
async function startService({ name,protoFile,packageName,serviceName,handlers,database,app,httpPort,grpcPort,onStart,onStop }) {
  const logger = createLogger(name);
  await database.checkDatabase();
  if (onStart) await onStart();
  const server = createServer();
  server.addService(getServiceDefinition(protoFile,packageName,serviceName),handlers);
  server.addService(getServiceDefinition('common/common.proto','cab.common.v1','HealthService'),health(database.checkDatabase));
  await new Promise((resolve,reject) => server.bindAsync(
    (process.env.GRPC_HOST || '0.0.0.0') + ':' + grpcPort,grpc.ServerCredentials.createInsecure(),(error) => error ? reject(error) : resolve()));
  const http = app.listen(httpPort,process.env.HTTP_HOST || '0.0.0.0');
  logger.info('Service listening',{ httpPort,grpcPort });
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    http.close();
    if (onStop) await onStop();
    await new Promise((resolve) => server.tryShutdown(resolve));
    await database.closeDatabase();
  }
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal,() => shutdown().catch((error) => {
    logger.error('Shutdown failed',{ error }); process.exit(1);
  }));
  return { server,http,shutdown };
}
module.exports = { startService };
