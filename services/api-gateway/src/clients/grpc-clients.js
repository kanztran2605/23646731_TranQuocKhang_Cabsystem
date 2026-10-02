'use strict';

const {
  grpc,
  createClient,
} = require(
  '../../../../shared/grpc/loader'
);

const env =
  require('../config/env');

const {
  SERVICE_DEFINITIONS,
  getServiceDefinition,
  getServiceAddress,
} = require('../config/grpc');

const businessClients =
  new Map();

const healthClients =
  new Map();

function getBusinessClient(
  serviceKey,
) {
  if (
    businessClients.has(
      serviceKey,
    )
  ) {
    return businessClients.get(
      serviceKey,
    );
  }

  const service =
    getServiceDefinition(
      serviceKey,
    );

  const client =
    createClient({
      protoFile:
        service.protoFile,

      packageName:
        service.packageName,

      serviceName:
        service.serviceName,

      address:
        getServiceAddress(
          serviceKey,
        ),
    });

  businessClients.set(
    serviceKey,
    client,
  );

  return client;
}

function getHealthClient(
  serviceKey,
) {
  if (
    healthClients.has(
      serviceKey,
    )
  ) {
    return healthClients.get(
      serviceKey,
    );
  }

  const client =
    createClient({
      protoFile:
        'common/common.proto',

      packageName:
        'cab.common.v1',

      serviceName:
        'HealthService',

      address:
        getServiceAddress(
          serviceKey,
        ),
    });

  healthClients.set(
    serviceKey,
    client,
  );

  return client;
}

function callUnary(
  client,
  methodName,
  request = {},
  timeoutMs =
    env.GRPC_HEALTH_TIMEOUT_MS,
) {
  if (
    !client ||
    typeof client[methodName] !==
      'function'
  ) {
    return Promise.reject(
      new Error(
        `Unknown gRPC unary method: ${methodName}`,
      ),
    );
  }

  return new Promise(
    (resolve, reject) => {
      const metadata =
        new grpc.Metadata();

      const deadline =
        new Date(
          Date.now() + timeoutMs,
        );

      client[methodName](
        request,
        metadata,
        { deadline },

        (error, response) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(response);
        },
      );
    },
  );
}

async function checkServiceHealth(
  serviceKey,
) {
  const service =
    getServiceDefinition(
      serviceKey,
    );

  try {
    const response =
      await callUnary(
        getHealthClient(
          serviceKey,
        ),
        'check',
        {},
        env.GRPC_HEALTH_TIMEOUT_MS,
      );

    const status =
      String(
        response?.status || '',
      ).toLowerCase();

    const healthy =
      status === 'healthy' ||
      status === 'ready';

    return {
      name: service.name,

      status:
        healthy
          ? 'healthy'
          : 'unhealthy',

      ...(response?.detail
        ? {
            detail:
              response.detail,
          }
        : {}),
    };
  } catch (error) {
    return {
      name: service.name,
      status: 'unhealthy',

      detail:
        error.details ||
        error.message ||
        'gRPC health check failed',
    };
  }
}

function buildRequestContext(req) {
  if (!req?.auth) {
    throw new Error(
      'Authenticated request context is required',
    );
  }

  return {
    actorUserId:
      req.auth.userId,

    actorRole:
      req.auth.role,

    ...(req.auth.customerId
      ? {
          actorCustomerId:
            req.auth.customerId,
        }
      : {}),

    ...(req.auth.driverId
      ? {
          actorDriverId:
            req.auth.driverId,
        }
      : {}),

    permissions:
      req.auth.permissions || [],

    correlationId:
      req.correlationId,

    ...(req.ip
      ? {
          ipAddress:
            req.ip,
        }
      : {}),
  };
}

function closeGrpcClients() {
  for (
    const client
    of businessClients.values()
  ) {
    client.close();
  }

  for (
    const client
    of healthClients.values()
  ) {
    client.close();
  }

  businessClients.clear();
  healthClients.clear();
}

module.exports = {
  SERVICE_DEFINITIONS,
  getBusinessClient,
  getHealthClient,
  callUnary,
  checkServiceHealth,
  buildRequestContext,
  closeGrpcClients,
};