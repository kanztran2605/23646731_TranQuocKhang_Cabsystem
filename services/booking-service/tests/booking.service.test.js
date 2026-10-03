'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function installStub(moduleId, exports) {
  require.cache[moduleId] = {
    id: moduleId,
    filename: moduleId,
    loaded: true,
    exports,
  };
}

const databaseId =
  require.resolve(
    '../src/config/database',
  );
const repositoryId =
  require.resolve(
    '../src/repositories/booking.repository',
  );
const customerClientId =
  require.resolve(
    '../src/grpc/customer.client',
  );
const driverClientId =
  require.resolve(
    '../src/grpc/driver.client',
  );
const publisherId =
  require.resolve(
    '../src/events/booking.publisher',
  );
const matchingId =
  require.resolve(
    '../src/services/driver-matching.service',
  );

const state = {
  driver: {
    driverId: '7',
    approvalStatus: 'APPROVED',
    availabilityStatus: 'AVAILABLE',
  },
  offer: null,
  assignment: null,
  publishedAccepted: [],
  publishedCreated: [],
  matchingStarts: [],
  createAssignmentCalls: 0,
  setBookingStatusCalls: [],
};

const database = {
  async withTransaction(work) {
    return work({ transaction: true });
  },
};

const repository = {
  async createBooking(input) {
    return {
      booking_id: 20,
      customer_id: input.customerId,
      pickup_latitude: input.pickup.latitude,
      pickup_longitude: input.pickup.longitude,
      pickup_address: input.pickup.address || null,
      destination_latitude: input.destination.latitude,
      destination_longitude: input.destination.longitude,
      destination_address: input.destination.address || null,
      requested_vehicle_type_id: input.vehicleTypeId,
      status: 'CREATED',
      created_at: new Date('2026-10-03T08:00:00.000Z'),
    };
  },
  async setBookingStatus(bookingId, nextStatus) {
    state.setBookingStatusCalls.push({ bookingId, nextStatus });
    return {
      booking_id: bookingId,
      status: nextStatus,
    };
  },
  async findBookingById(bookingId) {
    return {
      booking_id: bookingId,
      customer_id: 2,
      pickup_latitude: '10.760100',
      pickup_longitude: '106.680100',
      pickup_address: 'Pickup',
      destination_latitude: '10.776900',
      destination_longitude: '106.700900',
      destination_address: 'Destination',
      requested_vehicle_type_id: 1,
      status: 'SEARCHING',
      created_at: new Date('2026-10-03T08:00:00.000Z'),
      matching_started_at: null,
      assigned_driver_id: null,
      assigned_at: null,
    };
  },
  async lockOfferById() {
    return state.offer;
  },
  async findAssignmentByOfferId() {
    return state.assignment;
  },
  async markOfferStatus() {
    return state.offer;
  },
  async createAssignment(input) {
    state.createAssignmentCalls += 1;
    return {
      assignment_id: 30,
      booking_id: input.bookingId,
      offer_id: input.offerId,
      driver_id: input.driverId,
      vehicle_id: input.vehicleId,
      assigned_at: new Date(input.assignedAt),
    };
  },
  async expireOtherPendingOffers() {},
};

const customerClient = {
  async getCustomerByUserId() {
    return {
      customerId: '2',
      userId: '10',
      fullName: 'Customer Demo',
    };
  },
};

const driverClient = {
  async getMyDriverProfile() {
    return state.driver;
  },
  async listVehicleTypes() {
    return {
      items: [
        {
          vehicleTypeId: '1',
          status: 'ACTIVE',
        },
      ],
    };
  },
  async getDriverById() {
    return {
      driverId: '7',
      fullName: 'Tran Van Driver Demo',
      availabilityStatus: 'AVAILABLE',
      vehicle: {
        vehicleTypeId: '1',
        licensePlate: '51A-888.88',
      },
    };
  },
};

const publisher = {
  async publishBookingCreated(input) {
    state.publishedCreated.push(input);
  },
  async publishDriverAccepted(input) {
    state.publishedAccepted.push(input);
  },
};

const matching = {
  async startMatchingSafely(input) {
    state.matchingStarts.push(input);
    return null;
  },
  async continueMatchingSafely() {
    return null;
  },
  clearOfferTimer() {},
  clearMatchingRetry() {},
};

installStub(databaseId, database);
installStub(repositoryId, repository);
installStub(customerClientId, customerClient);
installStub(driverClientId, driverClient);
installStub(publisherId, publisher);
installStub(matchingId, matching);

const bookingService =
  require(
    '../src/services/booking.service'
  );

const customerContext = {
  actorUserId: '10',
  actorRole: 'CUSTOMER',
  permissions: [
    'BOOKING_CREATE',
    'BOOKING_READ_SELF',
  ],
  correlationId: 'req-customer',
};

const driverContext = {
  actorUserId: '12',
  actorRole: 'DRIVER',
  permissions: [
    'DRIVER_OFFER_RESPOND_SELF',
  ],
  correlationId: 'req-driver',
};

function acceptedOffer() {
  return {
    offer_id: 8,
    booking_id: 8,
    customer_id: 2,
    driver_id: 7,
    vehicle_id: 7,
    requested_vehicle_type_id: 1,
    status: 'ACCEPTED',
    booking_status: 'ASSIGNED',
    expires_at: new Date(Date.now() + 60000),
  };
}

function pendingOffer() {
  return {
    ...acceptedOffer(),
    status: 'PENDING',
    booking_status: 'SEARCHING',
  };
}

test.beforeEach(() => {
  state.driver = {
    driverId: '7',
    approvalStatus: 'APPROVED',
    availabilityStatus: 'AVAILABLE',
  };
  state.offer = null;
  state.assignment = null;
  state.publishedAccepted = [];
  state.publishedCreated = [];
  state.matchingStarts = [];
  state.createAssignmentCalls = 0;
  state.setBookingStatusCalls = [];
});

test('Create Booking persists CREATED, publishes booking.created, then starts matching', async () => {
  const result =
    await bookingService.createBooking({
      context: customerContext,
      idempotencyKey: 'BOOK-DEMO-001',
      pickup: {
        latitude: 10.7601,
        longitude: 106.6801,
        address: 'Pickup',
      },
      destination: {
        latitude: 10.7769,
        longitude: 106.7009,
        address: 'Destination',
      },
      vehicleTypeId: '1',
    });

  assert.equal(result.bookingId, '20');
  assert.equal(result.status, 'SEARCHING');
  assert.equal(state.publishedCreated.length, 1);
  assert.equal(state.matchingStarts.length, 1);
  assert.deepEqual(
    state.setBookingStatusCalls[0],
    {
      bookingId: 20,
      nextStatus: 'SEARCHING',
    },
  );
});

test('Accepted Offer replay is allowed after Driver has become BUSY and republishes the same business event', async () => {
  state.driver = {
    driverId: '7',
    approvalStatus: 'APPROVED',
    availabilityStatus: 'BUSY',
  };
  state.offer = acceptedOffer();
  state.assignment = {
    assignment_id: 30,
    booking_id: 8,
    offer_id: 8,
    driver_id: 7,
    vehicle_id: 7,
    assigned_at: new Date('2026-10-03T08:03:10.000Z'),
  };

  const result =
    await bookingService.acceptDriverOffer({
      context: driverContext,
      offerId: '8',
    });

  assert.equal(result.status, 'ASSIGNED');
  assert.equal(result.assignment.assignmentId, '30');
  assert.equal(state.createAssignmentCalls, 0);
  assert.equal(state.publishedAccepted.length, 1);
  assert.equal(
    state.publishedAccepted[0].assignmentId,
    30,
  );
});

test('BUSY Driver cannot accept a still-PENDING Offer', async () => {
  state.driver = {
    driverId: '7',
    approvalStatus: 'APPROVED',
    availabilityStatus: 'BUSY',
  };
  state.offer = pendingOffer();

  await assert.rejects(
    () =>
      bookingService.acceptDriverOffer({
        context: driverContext,
        offerId: '8',
      }),
    (error) => {
      assert.equal(
        error.code,
        'DRIVER_NOT_AVAILABLE',
      );
      assert.equal(
        error.statusCode,
        409,
      );
      return true;
    },
  );

  assert.equal(state.createAssignmentCalls, 0);
  assert.equal(state.publishedAccepted.length, 0);
});

test('Driver cannot accept another Driver\'s Offer', async () => {
  state.offer = {
    ...pendingOffer(),
    driver_id: 99,
  };

  await assert.rejects(
    () =>
      bookingService.acceptDriverOffer({
        context: driverContext,
        offerId: '8',
      }),
    (error) => {
      assert.equal(error.statusCode, 403);
      return true;
    },
  );

  assert.equal(state.createAssignmentCalls, 0);
});
