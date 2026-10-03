'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BOOKING_STATUS,
  toBooking,
  isTerminalBookingStatus,
} = require('../src/domain/booking');

const {
  DRIVER_OFFER_STATUS,
  toDriverOffer,
} = require('../src/domain/driver-offer');

const {
  toDriverAssignment,
} = require('../src/domain/driver-assignment');

test('Booking domain maps DB rows and terminal states correctly', () => {
  const row = {
    booking_id: 8,
    customer_id: 2,
    pickup_latitude: '10.760100',
    pickup_longitude: '106.680100',
    pickup_address: 'Pickup',
    destination_latitude: '10.776900',
    destination_longitude: '106.700900',
    destination_address: 'Destination',
    requested_vehicle_type_id: 1,
    status: BOOKING_STATUS.ASSIGNED,
    created_at: new Date('2026-10-03T08:00:00.000Z'),
    matching_started_at: new Date('2026-10-03T08:00:01.000Z'),
    assigned_at: new Date('2026-10-03T08:00:10.000Z'),
    assigned_driver_id: 7,
  };

  const result = toBooking(row, {
    driverId: '7',
    fullName: 'Tran Van Driver Demo',
    vehicle: {
      vehicleTypeId: '1',
      licensePlate: '51A-888.88',
    },
  });

  assert.equal(result.bookingId, '8');
  assert.equal(result.customerId, '2');
  assert.equal(result.status, 'ASSIGNED');
  assert.equal(result.pickup.latitude, 10.7601);
  assert.equal(result.destination.longitude, 106.7009);
  assert.equal(result.assignedDriver.driverId, '7');
  assert.equal(
    isTerminalBookingStatus(BOOKING_STATUS.ASSIGNED),
    true,
  );
  assert.equal(
    isTerminalBookingStatus(BOOKING_STATUS.NO_DRIVER_FOUND),
    true,
  );
  assert.equal(
    isTerminalBookingStatus(BOOKING_STATUS.SEARCHING),
    false,
  );
});

test('Driver Offer domain maps a pending offer correctly', () => {
  const result = toDriverOffer({
    offer_id: 6,
    booking_id: 6,
    driver_id: 7,
    vehicle_id: 7,
    pickup_latitude: '10.760100',
    pickup_longitude: '106.680100',
    pickup_address: 'Pickup',
    destination_latitude: '10.776900',
    destination_longitude: '106.700900',
    destination_address: 'Destination',
    requested_vehicle_type_id: 1,
    status: DRIVER_OFFER_STATUS.PENDING,
    expires_at: new Date('2026-10-03T08:01:00.000Z'),
    responded_at: null,
    created_at: new Date('2026-10-03T08:00:00.000Z'),
  });

  assert.equal(result.offerId, '6');
  assert.equal(result.bookingId, '6');
  assert.equal(result.driverId, '7');
  assert.equal(result.vehicleId, '7');
  assert.equal(result.vehicleTypeId, '1');
  assert.equal(result.status, 'PENDING');
});

test('Driver Assignment domain maps identifiers as strings', () => {
  const result = toDriverAssignment({
    assignment_id: 3,
    booking_id: 8,
    offer_id: 8,
    driver_id: 7,
    vehicle_id: 7,
    assigned_at: new Date('2026-10-03T08:03:10.000Z'),
  });

  assert.deepEqual(result, {
    assignmentId: '3',
    bookingId: '8',
    offerId: '8',
    driverId: '7',
    vehicleId: '7',
    assignedAt: '2026-10-03T08:03:10.000Z',
  });
});
