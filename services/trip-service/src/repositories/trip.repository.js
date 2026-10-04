'use strict';
const { pool } = require('../config/database');
function createTripRepository(database = pool) {
  const first = async (sql, values, client = database) => (await client.query(sql, values)).rows[0] || null;
  return {
    create(input, client) {
      return first("INSERT INTO trip(bid,cid,did,vid,customer_uid,driver_uid,s,paid,c_at,u_at) VALUES($1,$2,$3,$4,$5,$6,'ASSIGNED',false,$7,$7) ON CONFLICT(bid) DO NOTHING RETURNING *",
        [input.bookingId,input.customerId,input.driverId,input.vehicleId,input.customerUserId,input.driverUserId,input.acceptedAt],client);
    },
    byId(id, client) { return first('SELECT * FROM trip WHERE tid=$1',[id],client); },
    byBooking(id, client) { return first('SELECT * FROM trip WHERE bid=$1',[id],client); },
    lock(id, client) { return first('SELECT * FROM trip WHERE tid=$1 FOR UPDATE',[id],client); },
    change(id, status, reason, at, client) {
      return first("UPDATE trip SET s=$2::varchar,r=$3,u_at=$4::timestamptz,done_at=CASE WHEN $2::varchar='COMPLETED' THEN $4::timestamptz ELSE done_at END,can_at=CASE WHEN $2::varchar='CANCELED' THEN $4::timestamptz ELSE can_at END WHERE tid=$1 RETURNING *",[id,status,reason,at],client);
    },
    history(id, from, to, at, client) {
      return first('INSERT INTO trip_status_history(tid,from_s,to_s,chg_at) VALUES($1,$2,$3,$4) RETURNING *',[id,from,to,at],client);
    },
    async listHistory(id) { return (await database.query('SELECT * FROM trip_status_history WHERE tid=$1 ORDER BY hid',[id])).rows; },
    location(id, lat, lng, client) {
      return first('INSERT INTO trip_location(tid,lat,lng) VALUES($1,$2,$3) RETURNING *',[id,lat,lng],client);
    },
    paid(id, client) { return first('UPDATE trip SET paid=true WHERE tid=$1 RETURNING *',[id],client); },
  };
}
module.exports = { ...createTripRepository(), createTripRepository };
