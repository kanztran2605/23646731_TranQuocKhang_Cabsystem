'use strict';
function toNotification(row) {
  return { notificationId:String(row._id),sourceEventId:row.eid,recipientUserId:String(row.uid),type:row.type,
    reference:row.ref || row.ref_t + ':' + row.ref_id,message:row.msg,status:row.s,createdAt:new Date(row.c_at).toISOString() };
}
module.exports = { toNotification };
