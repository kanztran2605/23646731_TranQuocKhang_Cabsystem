'use strict';
const { grpc, createServer, createClient, getServiceDefinition } = require('../grpc/loader');
const { health } = require('../grpc/handlers');
async function serve(t, protoFile, packageName, serviceName, handlers, check = async () => {}) {
  const server = createServer();
  server.addService(getServiceDefinition(protoFile,packageName,serviceName),handlers);
  server.addService(getServiceDefinition('common/common.proto','cab.common.v1','HealthService'),health(check));
  const port = await new Promise((resolve,reject) => server.bindAsync('127.0.0.1:0',grpc.ServerCredentials.createInsecure(),(error,port) => error ? reject(error) : resolve(port)));
  const client = createClient({ protoFile,packageName,serviceName,address: '127.0.0.1:' + port });
  const healthClient = createClient({ protoFile: 'common/common.proto',packageName: 'cab.common.v1',serviceName: 'HealthService',address: '127.0.0.1:' + port });
  t.after(() => { client.close(); healthClient.close(); server.forceShutdown(); });
  const call = (method,request = {}) => new Promise((resolve,reject) => client[method](request,{ deadline: new Date(Date.now()+1500) },(error,result) => error ? reject(error) : resolve(result)));
  const checkHealth = () => new Promise((resolve,reject) => healthClient.check({},{ deadline: new Date(Date.now()+1500) },(error,result) => error ? reject(error) : resolve(result)));
  return { call,checkHealth,port };
}
module.exports = { serve };
