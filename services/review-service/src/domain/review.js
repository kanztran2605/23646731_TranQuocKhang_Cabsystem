'use strict';
function toReview(row) {
  return { reviewId:String(row.rid),tripId:String(row.tid),customerId:String(row.cid),driverId:String(row.did),score:row.star,
    ...(row.cmt != null ? { comment:row.cmt } : {}),createdAt:new Date(row.c_at).toISOString() };
}
module.exports = { toReview };
