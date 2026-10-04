'use strict';
function toPayment(row) {
  return { paymentId:String(row.pid), bookingId:String(row.bid), customerId:String(row.cid),
    ...(row.tid != null ? { tripId:String(row.tid) } : {}), amount:Number(row.amt), eligible:row.eligible, status:row.s,
    ...(row.ikey != null ? { idempotencyKey:row.ikey } : {}), createdAt:new Date(row.c_at).toISOString(),
    ...(row.paid_at ? { paidAt:new Date(row.paid_at).toISOString() } : {}) };
}
module.exports = { toPayment };
