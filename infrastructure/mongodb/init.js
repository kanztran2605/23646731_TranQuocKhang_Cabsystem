const dbName = process.env.MONGO_INITDB_DATABASE || 'notification_db';
const ndb = db.getSiblingDB(dbName);

if (!ndb.getCollectionNames().includes('notifications')) {
  ndb.createCollection('notifications');
}

ndb.notifications.createIndex({ eid: 1 }, { unique: true, name: 'uq_notification_eid' });
ndb.notifications.createIndex({ uid: 1, c_at: -1 }, { name: 'idx_notification_uid_time' });

ndb.notifications.updateOne(
  { eid: '00000000-0000-0000-0000-000000000001' },
  {
    $setOnInsert: {
      eid: '00000000-0000-0000-0000-000000000001',
      uid: 1,
      type: 'WELCOME',
      ref: 'seed:1',
      msg: 'CAB demo ready',
      s: 'SENT',
      c_at: new Date()
    }
  },
  { upsert: true }
);
