'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BOOKING_MATCH_RADIUS_KM = '1';
process.env.BOOKING_MATCH_CANDIDATE_LIMIT = '2';
process.env.DRIVER_OFFER_TTL_SECONDS = '3600';
process.env.BOOKING_MATCHING_TIMEOUT_SECONDS = '300';
process.env.BOOKING_MATCHING_RETRY_SECONDS = '5';

function installStub(moduleId, exports) {
  require.cache[moduleId] = {
    id: moduleId,
    filename: moduleId,
    loaded: true,
    exports,
  };
}

const repositoryId =
  require.resolve(
    '../src/repositories/booking.repository',
  );
const driverClientId =
  require.resolve(
    '../src/grpc/driver.client',
  );
const publisherId =
  require.resolve(
    '../src/events/booking.publisher',
  );

const state = {
  offered: new Set(),
  pages: [],
  createdOffer: null,
  noDriverEvent: null,
  setStatusCalls: [],
};

const repository = {
  async findPendingOfferForBooking() {
    return null;
  },
  async expireOfferIfDue() {
    return null;
  },
  async listOfferedDriverIds() {
    return state.offered;
  },
  async createDriverOffer(input) {
    state.createdOffer = input;
    return {
      offer_id: 99,
      booking_id: input.bookingId,
      driver_id: input.driverId,
      vehicle_id: input.vehicleId,
      status: 'PENDING',
      created_at: new Date('2026-10-03T08:00:00.000Z'),
      expires_at: input.expiresAt,
    };
  },
  async setBookingStatus(bookingId, nextStatus, expectedStatus) {
    state.setStatusCalls.push({ bookingId, nextStatus, expectedStatus });
    return {
      booking_id: bookingId,
      customer_id: 2,
      status: nextStatus,
    };
  },
  async findBookingById() {
    return null;
  },
  async listPendingOffersForRecovery() {
    return [];
  },
  async listSearchingBookingsWithoutPendingOffer() {
    return [];
  },
};

const driverClient = {
  async findEligibleDrivers({ page }) {
    state.pages.push(page);

    if (page === 1) {
      return {
        items: [
          {
            driverId: '1',
            vehicleId: '1',
            vehicleTypeId: '1',
          },
          {
            driverId: '2',
            vehicleId: '2',
            vehicleTypeId: '1',
          },
        ],
      };
    }

    return {
      items: [
        {
          driverId: '7',
          vehicleId: '7',
          vehicleTypeId: '1',
        },
      ],
    };
  },
};

const publisher = {
  async publishDriverOfferCreated() {},
  async publishNoDriverFound(input) {
    state.noDriverEvent = input;
  },
};

installStub(repositoryId, repository);
installStub(driverClientId, driverClient);
installStub(publisherId, publisher);

const matching =
  require(
    '../src/services/driver-matching.service'
  );

function booking(overrides = {}) {
  return {
    booking_id: 8,
    customer_id: 2,
    pickup_latitude: '10.760100',
    pickup_longitude: '106.680100',
    requested_vehicle_type_id: 1,
    status: 'SEARCHING',
    created_at: new Date(),
    ...overrides,
  };
}

test.afterEach(() => {
  matching.stopAllTimers();
  state.offered = new Set();
  state.pages = [];
  state.createdOffer = null;
  state.noDriverEvent = null;
  state.setStatusCalls = [];
});

test('matching paginates past drivers already offered for the same Booking', async () => {
  state.offered = new Set(['1', '2']);

  const result =
    await matching.startMatching({
      booking: booking(),
      correlationId: 'req-8',
    });

  assert.deepEqual(state.pages, [1, 2]);
  assert.equal(state.createdOffer.driverId, '7');
  assert.equal(state.createdOffer.vehicleId, '7');
  assert.equal(result.driver_id, '7');
});

test('matching ends as NO_DRIVER_FOUND only when no remaining eligible candidate exists', async () => {
  state.offered = new Set(['1', '2', '7']);

  const result =
    await matching.startMatching({
      booking: booking(),
      correlationId: 'req-8',
    });

  assert.equal(result.status, 'NO_DRIVER_FOUND');
  assert.equal(state.createdOffer, null);
  assert.equal(state.setStatusCalls.length, 1);
  assert.equal(
    state.setStatusCalls[0].nextStatus,
    'NO_DRIVER_FOUND',
  );
  assert.equal(
    state.noDriverEvent.reason,
    'NO_SUITABLE_DRIVER',
  );
});

test('terminal Booking does not start matching again', async () => {
  const result =
    await matching.startMatching({
      booking: booking({
        status: 'ASSIGNED',
      }),
      correlationId: 'req-8',
    });

  assert.equal(result, null);
  assert.deepEqual(state.pages, []);
  assert.equal(state.createdOffer, null);
});
