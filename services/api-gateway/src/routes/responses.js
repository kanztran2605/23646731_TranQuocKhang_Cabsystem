'use strict';

const { publicId, nullableId, publicLocation } = require('./transport');

function customer(value) {
  return { cid: publicId(value.customerId), uid: publicId(value.userId), name: value.name, addr: value.address ?? null };
}
function driver(value) {
  return {
    did: publicId(value.driverId), uid: publicId(value.userId), name: value.name,
    ap: value.approvalStatus, av: value.availabilityStatus,
    vid: nullableId(value.vehicle?.vehicleId), vt: value.vehicle?.vehicleType ?? null,
    plate: value.vehicle?.licensePlate ?? null,
    lat: value.location?.latitude ?? null, lng: value.location?.longitude ?? null,
    km: value.distanceKm ?? null,
  };
}
function booking(value) {
  return {
    bid: publicId(value.bookingId), cid: publicId(value.customerId),
    p: publicLocation(value.pickup), d: publicLocation(value.destination),
    vt: value.vehicleType, s: value.status,
    oid: nullableId(value.offerId), did: nullableId(value.driverId),
  };
}
function offer(value) {
  return { oid: publicId(value.offerId), bid: publicId(value.bookingId), did: publicId(value.driverId),
    vid: nullableId(value.vehicleId), s: value.status };
}
function trip(value) {
  return { tid: publicId(value.tripId), bid: publicId(value.bookingId), cid: publicId(value.customerId),
    did: publicId(value.driverId), s: value.status, paid: value.paid, r: value.cancelReason ?? null };
}
function payment(value) {
  return { pid: publicId(value.paymentId), bid: publicId(value.bookingId), tid: nullableId(value.tripId),
    cid: publicId(value.customerId), amt: value.amount, eligible: value.eligible, s: value.status,
    key: value.idempotencyKey ?? null };
}
function review(value) {
  return { rid: publicId(value.reviewId), tid: publicId(value.tripId), cid: publicId(value.customerId),
    did: publicId(value.driverId), star: value.score, ...(value.comment !== undefined ? { c: value.comment } : {}) };
}
function notification(value) {
  return { nid: value.notificationId, eid: value.sourceEventId, uid: publicId(value.recipientUserId),
    type: value.type, ref: value.reference, msg: value.message, s: value.status, c_at: value.createdAt };
}
function page(value, mapper) {
  return { page: value.page, limit: value.limit, items: value.items.map(mapper) };
}
module.exports = { customer, driver, booking, offer, trip, payment, review, notification, page };
