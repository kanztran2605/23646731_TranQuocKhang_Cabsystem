'use strict';

const {
  grpc,
} = require(
  '../../../../shared/grpc/loader'
);

const {
  AppError,
} = require(
  '../../../../shared/errors/app-error'
);

const bookingService =
  require(
    '../services/booking.service'
  );

function toGrpcError(
  error,
) {
  if (
    error instanceof
    AppError
  ) {
    const statusMap = {
      400:
        grpc.status
          .INVALID_ARGUMENT,

      401:
        grpc.status
          .UNAUTHENTICATED,

      403:
        grpc.status
          .PERMISSION_DENIED,

      404:
        grpc.status
          .NOT_FOUND,

      409:
        grpc.status
          .FAILED_PRECONDITION,

      429:
        grpc.status
          .RESOURCE_EXHAUSTED,

      503:
        grpc.status
          .UNAVAILABLE,
    };

    return {
      code:
        statusMap[
          error.statusCode
        ] ||
        grpc.status
          .INTERNAL,

      details:
        error.message,
    };
  }

  return {
    code:
      grpc.status
        .INTERNAL,

    details:
      'Internal server error',
  };
}

function unary(handler) {
  return async (
    call,
    callback,
  ) => {
    try {
      callback(
        null,

        await handler(
          call.request,
        ),
      );
    } catch (error) {
      callback(
        toGrpcError(
          error,
        ),
      );
    }
  };
}

function createBookingGrpcHandlers() {
  return {
    createBooking:
      unary(
        bookingService
          .createBooking,
      ),

    getBooking:
      unary(
        bookingService
          .getBooking,
      ),

    getMyBookings:
      unary(
        bookingService
          .getMyBookings,
      ),

    getMyDriverOffers:
      unary(
        bookingService
          .getMyDriverOffers,
      ),

    acceptDriverOffer:
      unary(
        bookingService
          .acceptDriverOffer,
      ),

    rejectDriverOffer:
      unary(
        bookingService
          .rejectDriverOffer,
      ),
  };
}

module.exports = {
  createBookingGrpcHandlers,
};