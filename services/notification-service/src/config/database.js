'use strict';
const { MongoClient } = require('mongodb');
const host = process.env.MONGO_HOST || 'mongodb', port = process.env.MONGO_PORT || 27017;
const client = new MongoClient('mongodb://' + host + ':' + port, {
  ...(process.env.MONGO_USER ? { auth:{ username:process.env.MONGO_USER,password:process.env.MONGO_PASSWORD },authSource:process.env.MONGO_AUTH_SOURCE || 'admin' } : {}),
  serverSelectionTimeoutMS:2000,connectTimeoutMS:2000,
});
const database = client.db(process.env.MONGO_DB_NAME || 'notification_db');
async function checkDatabase() { await database.command({ ping:1 }); }
async function ensureIndexes() {
  await database.collection('notifications').createIndex({ eid:1,uid:1 },{ unique:true,name:'uq_notification_eid_uid' });
  const indexes = await database.collection('notifications').indexes();
  if (indexes.some(index => index.unique && Object.keys(index.key).length === 1 && index.key.eid === 1)) {
    throw new Error('Local Notification index repair required before startup');
  }
  await database.collection('notifications').createIndex({ uid:1,c_at:-1 },{ name:'idx_notification_uid_time' });
}
module.exports = { database,checkDatabase,ensureIndexes,closeDatabase:() => client.close() };
