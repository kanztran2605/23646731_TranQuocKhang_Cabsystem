'use strict';
const { pool } = require('../config/database');
function createPaymentRepository(database = pool) {
  const first = async (sql, values, client = database) => (await client.query(sql,values)).rows[0] || null;
  return {
    create(p, client) {
      return first("INSERT INTO payment(bid,cid,customer_uid,amt,s,eligible,c_at) VALUES($1,$2,$3,50000,'PENDING',false,$4) ON CONFLICT(bid) DO NOTHING RETURNING *",
        [p.bookingId,p.customerId,p.customerUserId,p.createdAt],client);
    },
    byId(id, client) { return first('SELECT * FROM payment WHERE pid=$1',[id],client); },
    byBooking(id, client) { return first('SELECT * FROM payment WHERE bid=$1',[id],client); },
    lock(id, client) { return first('SELECT * FROM payment WHERE pid=$1 FOR UPDATE',[id],client); },
    lockByBooking(id, client) { return first('SELECT * FROM payment WHERE bid=$1 FOR UPDATE',[id],client); },
    eligible(id, tripId, client) { return first('UPDATE payment SET tid=$2,eligible=true WHERE pid=$1 RETURNING *',[id,tripId],client); },
    key(id, key, client) { return first('UPDATE payment SET ikey=$2 WHERE pid=$1 RETURNING *',[id,key],client); },
    complete(id, at, client) { return first("UPDATE payment SET s='COMPLETED',paid_at=$2 WHERE pid=$1 RETURNING *",[id,at],client); },
  };
}
module.exports = { ...createPaymentRepository(), createPaymentRepository };
