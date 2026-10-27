'use strict';

// Presentation labels belong only to REST responses. Request aliases and proto
// fields are unchanged; /api/v1 retains its existing short response keys.
const RESPONSE_LABELS = Object.freeze({
  token: 'Token', role: 'Role', uid: 'User ID', cid: 'Customer ID',
  did: 'Driver ID', vid: 'Vehicle ID', bid: 'Booking ID', oid: 'Offer ID',
  tid: 'Trip ID', pid: 'Payment ID', rid: 'Review ID', nid: 'Notification ID',
  eid: 'Event ID', name: 'Name', addr: 'Address', phone: 'Phone', driver: 'Driver',
  ap: 'Approval Status', av: 'Availability Status', vt: 'Vehicle Type',
  plate: 'License Plate', lat: 'Latitude', lng: 'Longitude', km: 'Distance (km)',
  p: 'Pickup', d: 'Destination', s: 'Status', paid: 'Paid', r: 'Cancel Reason',
  amt: 'Amount', eligible: 'Eligible', key: 'Idempotency Key',
  star: 'Rating', c: 'Comment', type: 'Type', ref: 'Reference', msg: 'Message', c_at: 'Created At',
  page: 'Page', limit: 'Limit', items: 'Items', otp: 'OTP', tripPending: 'Trip Pending',
});

function readableResponse(value) {
  if (Array.isArray(value)) return value.map(readableResponse);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    Object.hasOwn(RESPONSE_LABELS, key) ? RESPONSE_LABELS[key] : key,
    readableResponse(item),
  ]));
}

function presentationMiddleware(req, res, next) {
  if (req.baseUrl === '/api') {
    const json = res.json;
    res.json = function publicJson(body) {
      // Error keys stay consistent with the shared HTTP error contract.
      return json.call(this, this.statusCode < 400 ? readableResponse(body) : body);
    };
  }
  next();
}

module.exports = { presentationMiddleware, readableResponse };
