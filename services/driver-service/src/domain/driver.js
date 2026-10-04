'use strict';
const APPROVAL_STATUS = Object.freeze({ PENDING_APPROVAL: 'PENDING_APPROVAL', APPROVED: 'APPROVED', REJECTED: 'REJECTED' });
const AVAILABILITY_STATUS = Object.freeze({ OFFLINE: 'OFFLINE', AVAILABLE: 'AVAILABLE', BUSY: 'BUSY' });
function toDriver(row) {
  return { driverId: String(row.did), userId: String(row.uid), name: row.name,
    approvalStatus: row.ap, availabilityStatus: row.av,
    ...(row.vid ? { vehicle: { vehicleId: String(row.vid), driverId: String(row.did), vehicleType: row.vt,
      licensePlate: row.plate, ...(row.brand != null ? { brand: row.brand } : {}),
      ...(row.model != null ? { model: row.model } : {}), status: row.vehicle_status } } : {}),
    ...(row.lat != null ? { location: toLocation(row) } : {}),
    ...(row.distance_km != null ? { distanceKm: Number(row.distance_km) } : {}) };
}
function toLocation(row) {
  return { driverId: String(row.did), latitude: Number(row.lat), longitude: Number(row.lng),
    recordedAt: new Date(row.rec_at).toISOString() };
}
module.exports = { APPROVAL_STATUS, AVAILABILITY_STATUS, toDriver, toLocation };
