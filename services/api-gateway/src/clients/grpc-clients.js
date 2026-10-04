'use strict';

const { grpc, createClient } = require('../../../../shared/grpc/loader');
const { normalizeCorrelationId } = require('../../../../shared/correlation');
const { grpcToAppError } = require('../../../../shared/errors/grpc-error');
const env = require('../config/env');
const { SERVICE_DEFINITIONS, getServiceDefinition, getServiceAddress } = require('../config/grpc');

const businessClients = new Map();
const healthClients = new Map();

function getBusinessClient(serviceKey) {
  if (!businessClients.has(serviceKey)) {
    const service = getServiceDefinition(serviceKey);
    businessClients.set(serviceKey, createClient({
      protoFile: service.protoFile,
      packageName: service.packageName,
      serviceName: service.serviceName,
      address: getServiceAddress(serviceKey),
    }));
  }
  return businessClients.get(serviceKey);
}

function getHealthClient(serviceKey) {
  if (!healthClients.has(serviceKey)) {
    healthClients.set(serviceKey, createClient({
      protoFile: 'common/common.proto',
      packageName: 'cab.common.v1',
      serviceName: 'HealthService',
      address: getServiceAddress(serviceKey),
    }));
  }
  return healthClients.get(serviceKey);
}

function callUnary(client, methodName, request = {}, timeoutMs = 5000, requestId) {
  if (typeof client?.[methodName] !== 'function') {
    return Promise.reject(new Error('Unknown gRPC unary method: ' + methodName));
  }
  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    const id = normalizeCorrelationId(requestId || request.context?.correlationId || request.correlationId);
    if (id) metadata.set('x-correlation-id', id);
    let rpc;
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('gRPC deadline exceeded'), { code: grpc.status.DEADLINE_EXCEEDED }));
      rpc?.cancel();
    }, timeoutMs);
    try {
      rpc = client[methodName](request, metadata, { deadline: new Date(Date.now() + timeoutMs) }, (error, response) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(response);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function callRpc(serviceKey, methodName, request, requestId) {
  try {
    return await callUnary(getBusinessClient(serviceKey), methodName, request, 5000, requestId);
  } catch (error) {
    throw grpcToAppError(error);
  }
}

async function checkServiceHealth(serviceKey, requestId) {
  const { name } = getServiceDefinition(serviceKey);
  try {
    const result = await callUnary(getHealthClient(serviceKey), 'check', {}, env.GRPC_HEALTH_TIMEOUT_MS, requestId);
    return { name, s: result?.status === 'UP' ? 'UP' : 'DOWN' };
  } catch (_error) {
    return { name, s: 'DOWN' };
  }
}

function buildRequestContext(req) {
  return {
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    ...(req.auth.customerId ? { actorCustomerId: req.auth.customerId } : {}),
    ...(req.auth.driverId ? { actorDriverId: req.auth.driverId } : {}),
    correlationId: req.correlationId,
  };
}

function closeGrpcClients() {
  for (const client of [...businessClients.values(), ...healthClients.values()]) client.close();
  businessClients.clear();
  healthClients.clear();
}

module.exports = { SERVICE_DEFINITIONS, getBusinessClient, getHealthClient, callUnary, callRpc, checkServiceHealth, buildRequestContext, closeGrpcClients };
