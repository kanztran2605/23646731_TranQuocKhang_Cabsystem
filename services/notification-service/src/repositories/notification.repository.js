'use strict';
const { database } = require('../config/database');
function createNotificationRepository(collection = database.collection('notifications')) {
  return {
    async save(row) {
      try { await collection.updateOne({ eid:row.eid,uid:row.uid },{ $setOnInsert:row },{ upsert:true }); }
      catch (error) { if (error.code !== 11000) throw error; }
    },
    list(uid, limit) {
      // Old demo documents used numeric uid. Query both representations safely.
      const ids = [uid]; if (BigInt(uid) <= BigInt(Number.MAX_SAFE_INTEGER)) ids.push(Number(uid));
      return collection.find({ uid:{ $in:ids } }).sort({ c_at:-1,_id:-1 }).limit(limit).toArray();
    },
  };
}
module.exports = { ...createNotificationRepository(),createNotificationRepository };
