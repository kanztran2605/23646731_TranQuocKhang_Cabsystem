'use strict';
const { pool } = require('../config/database');
const BOOKING_SELECT = 'SELECT b.*,o.oid,o.did FROM booking b LEFT JOIN driver_offer o ON o.bid=b.bid';
function createBookingRepository(database = pool) {
  const run = (client) => client || database;
  const first = async (sql, values, client) => (await run(client).query(sql, values)).rows[0] || null;
  return {
    createBooking({ customerId, pickup, destination, vehicleType }) {
      return first("INSERT INTO booking(cid,p_lat,p_lng,p_addr,d_lat,d_lng,d_addr,vt,s) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SEARCHING') RETURNING *",
        [customerId,pickup.latitude,pickup.longitude,pickup.address ?? null,destination.latitude,destination.longitude,destination.address ?? null,vehicleType]);
    },
    findBookingById(bookingId) { return first(BOOKING_SELECT + ' WHERE b.bid=$1', [bookingId]); },
    lockBookingById(bookingId, client) { return first('SELECT * FROM booking WHERE bid=$1 FOR UPDATE', [bookingId], client); },
    setBookingStatus(bookingId, nextStatus, expectedStatus, client, assignedAt = null) {
      return first('UPDATE booking SET s=$2,ass_at=COALESCE($4::timestamptz,ass_at) WHERE bid=$1 AND s=$3 RETURNING *',
        [bookingId,nextStatus,expectedStatus,assignedAt], client);
    },
    async listCustomerBookings({ customerId, page, limit }) {
      const count = await first('SELECT COUNT(*) AS total FROM booking WHERE cid=$1', [customerId]);
      const rows = await database.query(BOOKING_SELECT + ' WHERE b.cid=$1 ORDER BY b.c_at DESC,b.bid DESC LIMIT $2 OFFSET $3',
        [customerId,limit,(page-1)*limit]);
      return { total: count.total, rows: rows.rows };
    },
    findOfferForBooking(bookingId, client) { return first('SELECT * FROM driver_offer WHERE bid=$1', [bookingId], client); },
    createDriverOffer({ bookingId, driverId, vehicleId }, client) {
      return first("INSERT INTO driver_offer(bid,did,vid,s) VALUES ($1,$2,$3,'OPEN') RETURNING *", [bookingId,driverId,vehicleId], client);
    },
    // Lock the aggregate before the Offer so concurrent acceptance has one order.
    async lockOfferById(offerId, client) {
      const ref = await first('SELECT bid FROM driver_offer WHERE oid=$1', [offerId], client);
      if (!ref) return null;
      await first('SELECT bid FROM booking WHERE bid=$1 FOR UPDATE', [ref.bid], client);
      return first('SELECT o.*,b.cid,b.s AS booking_status FROM driver_offer o JOIN booking b ON b.bid=o.bid WHERE o.oid=$1 FOR UPDATE OF o', [offerId], client);
    },
    async listOpenOffersByDriver(driverId) {
      return (await database.query("SELECT o.* FROM driver_offer o JOIN booking b ON b.bid=o.bid WHERE o.did=$1 AND o.s='OPEN' AND b.s='SEARCHING' ORDER BY o.c_at DESC,o.oid DESC", [driverId])).rows;
    },
    async driverHasOfferForBooking(bookingId, driverId) {
      return !!await first('SELECT oid FROM driver_offer WHERE bid=$1 AND did=$2', [bookingId,driverId]);
    },
    markOfferAccepted(offerId, acceptedAt, client) {
      return first("UPDATE driver_offer SET s='ACCEPTED',acc_at=$2 WHERE oid=$1 AND s='OPEN' RETURNING *", [offerId,acceptedAt], client);
    },
    createAssignment({ bookingId, offerId, driverId, vehicleId, assignedAt }, client) {
      return first('INSERT INTO driver_assignment(bid,oid,did,vid,ass_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [bookingId,offerId,driverId,vehicleId,assignedAt], client);
    },
    findAssignmentByBookingId(bookingId, client) { return first('SELECT * FROM driver_assignment WHERE bid=$1', [bookingId], client); },
    findAssignmentByOfferId(offerId, client) { return first('SELECT * FROM driver_assignment WHERE oid=$1', [offerId], client); },
  };
}
module.exports = { ...createBookingRepository(), createBookingRepository };
