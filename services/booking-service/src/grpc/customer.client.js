'use strict';

const {
  grpc,
  createClient,
} = require(
  '../../../../shared/grpc/loader'
);

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

let client = null;

function getClient() {
  if (!client) {
    client =
      createClient({
        protoFile:
          'customer.proto',

        packageName:
          'cab.customer.v1',

        serviceName:
          'CustomerService',

        address:
          `${
            process.env
              .CUSTOMER_SERVICE_HOST ||
            'customer-service'
          }:${
            process.env
              .CUSTOMER_GRPC_PORT ||
            50052
          }`,
      });
  }

  return client;
}

function callUnary(
  methodName,
  request,
  timeoutMs = 5000,
) {
  const current =
    getClient();

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      current[
        methodName
      ](
        request,

        new grpc.Metadata(),

        {
          deadline:
            new Date(
              Date.now() +
              timeoutMs,
            ),
        },

        (
          error,
          response,
        ) => {
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

function mapGrpcError(
  error,
) {
  switch (error.code) {
    case grpc.status
      .NOT_FOUND:
      return AppError.notFound(
        error.details ||
          'Customer does not exist',
        'CUSTOMER_NOT_FOUND',
      );

    case grpc.status
      .INVALID_ARGUMENT:
      return AppError.badRequest(
        error.details ||
          'Invalid Customer request',
        'INVALID_REQUEST',
      );

    case grpc.status
      .UNAVAILABLE:

    case grpc.status
      .DEADLINE_EXCEEDED:
      return new AppError(
        'Customer service is unavailable',
        {
          code:
            'CUSTOMER_SERVICE_UNAVAILABLE',

          statusCode: 503,
        },
      );

    default:
      return AppError.internal(
        'Customer service request failed',
        'CUSTOMER_SERVICE_ERROR',
        error,
      );
  }
}

async function getCustomerByUserId(
  userId,
  correlationId,
) {
  try {
    return await callUnary(
      'getCustomerByUserId',

      {
        userId:
          String(userId),

        correlationId,
      },
    );
  } catch (error) {
    throw mapGrpcError(
      error,
    );
  }
}

function closeCustomerClient() {
  if (client) {
    client.close();
    client = null;
  }
}

module.exports = {
  getCustomerByUserId,
  closeCustomerClient,
};