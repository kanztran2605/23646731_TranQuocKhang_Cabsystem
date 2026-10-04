'use strict';
const DRIVER_OFFER_STATUS = Object.freeze({ OPEN: 'OPEN', ACCEPTED: 'ACCEPTED' });
function toDriverOffer(row) {
  return { offerId: String(row.oid), bookingId: String(row.bid), driverId: String(row.did), status: row.s,
    ...(row.vid != null ? { vehicleId: String(row.vid) } : {}), createdAt: new Date(row.c_at).toISOString(),
    ...(row.acc_at ? { acceptedAt: new Date(row.acc_at).toISOString() } : {}) };
}
module.exports = { DRIVER_OFFER_STATUS, toDriverOffer };
