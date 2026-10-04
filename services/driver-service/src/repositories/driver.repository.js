'use strict';
const { pool, withTransaction } = require('../config/database');
const projection = 'SELECT d.did,d.uid,d.ap,d.av,p.name,v.vid,v.vt,v.plate,v.brand,v.model,v.s AS vehicle_status,l.lat,l.lng,l.rec_at FROM driver d JOIN driver_profile p ON p.did=d.did LEFT JOIN LATERAL (SELECT * FROM vehicle WHERE did=d.did ORDER BY (s=\'ACTIVE\') DESC,vid LIMIT 1) v ON TRUE LEFT JOIN driver_location l ON l.did=d.did';
async function findById(driverId, client = pool) { return (await client.query(projection + ' WHERE d.did=$1', [driverId])).rows[0]; }
async function findByUserId(userId) { return (await pool.query(projection + ' WHERE d.uid=$1', [userId])).rows[0]; }
async function register(input) {
  return withTransaction(async (client) => {
    const driver = (await client.query('INSERT INTO driver (uid) VALUES ($1) RETURNING did', [input.userId])).rows[0];
    await client.query('INSERT INTO driver_profile (did,name,lic_enc,key_ver) VALUES ($1,$2,$3,1)', [driver.did,input.name,input.encryptedLicense ?? null]);
    const vehicle = (await client.query('INSERT INTO vehicle (did,vt,plate,brand,model) VALUES ($1,$2,$3,$4,$5) RETURNING vid', [driver.did,input.vehicleType,input.licensePlate,input.brand ?? null,input.model ?? null])).rows[0];
    await client.query('INSERT INTO driver_application (did,vid) VALUES ($1,$2)', [driver.did,vehicle.vid]);
    return findById(driver.did, client);
  });
}
async function pending({ limit, offset }) {
  const count = await pool.query("SELECT COUNT(*) FROM driver WHERE ap='PENDING_APPROVAL'");
  const rows = await pool.query(projection + " WHERE d.ap='PENDING_APPROVAL' ORDER BY d.did LIMIT $1 OFFSET $2", [limit,offset]);
  return { total: count.rows[0].count, rows: rows.rows };
}
async function approve({ driverId, approvalStatus, reviewerUserId }) {
  return withTransaction(async (client) => {
    const changed = await client.query("UPDATE driver SET ap=$2,u_at=CURRENT_TIMESTAMP WHERE did=$1 AND ap='PENDING_APPROVAL' RETURNING did,u_at", [driverId,approvalStatus]);
    if (!changed.rows[0]) return null;
    await client.query("UPDATE driver_application SET s=$2,rev_uid=$3,rev_at=CURRENT_TIMESTAMP WHERE did=$1 AND s='PENDING_APPROVAL'", [driverId,approvalStatus,reviewerUserId]);
    return { driver: await findById(driverId,client), changedAt: changed.rows[0].u_at };
  });
}
async function availability({ driverId, online }) {
  const changed = await pool.query("UPDATE driver SET av=$2,u_at=CURRENT_TIMESTAMP WHERE did=$1 AND av<>'BUSY' AND ($2='OFFLINE' OR ap='APPROVED') RETURNING did", [driverId, online ? 'AVAILABLE' : 'OFFLINE']);
  return changed.rows[0] ? findById(driverId) : null;
}
async function markBusy(driverId) {
  const changed = await pool.query("UPDATE driver SET av='BUSY',u_at=CURRENT_TIMESTAMP WHERE did=$1 AND ap='APPROVED' AND av='AVAILABLE' RETURNING did", [driverId]);
  return changed.rows[0] ? findById(driverId) : null;
}
async function updateLocation({ driverId, latitude, longitude }) {
  return (await pool.query('INSERT INTO driver_location (did,lat,lng) VALUES ($1,$2,$3) ON CONFLICT (did) DO UPDATE SET lat=EXCLUDED.lat,lng=EXCLUDED.lng,rec_at=CURRENT_TIMESTAMP RETURNING did,lat,lng,rec_at', [driverId,latitude,longitude])).rows[0];
}
async function location(driverId) { return (await pool.query('SELECT did,lat,lng,rec_at FROM driver_location WHERE did=$1', [driverId])).rows[0]; }
const point = 'ST_SetSRID(ST_MakePoint(l.lng,l.lat),4326)::geography';
const origin = 'ST_SetSRID(ST_MakePoint($2,$1),4326)::geography';
async function nearby({ latitude, longitude, radiusKm, limit, offset }) {
  const params = [latitude,longitude,radiusKm * 1000];
  const condition = ' WHERE l.did IS NOT NULL AND ST_DWithin(' + point + ',' + origin + ',$3)';
  const count = await pool.query('SELECT COUNT(*) FROM driver_location l' + condition, params);
  const sql = projection.replace('SELECT d.did', 'SELECT ST_Distance(' + point + ',' + origin + ')/1000 AS distance_km,d.did');
  const rows = await pool.query(sql + condition + ' ORDER BY distance_km,d.did LIMIT $4 OFFSET $5', [...params,limit,offset]);
  return { rows: rows.rows, total: count.rows[0].count };
}
async function eligible({ pickupLatitude, pickupLongitude, radiusKm, vehicleType, limit }) {
  const sql = 'SELECT d.did,d.uid,v.vid,v.vt,l.lat,l.lng,ST_Distance(' + point + ',' + origin + ')/1000 AS distance_km FROM driver d JOIN driver_location l ON l.did=d.did JOIN LATERAL (SELECT vid,vt FROM vehicle WHERE did=d.did AND s=\'ACTIVE\' AND vt=$4 ORDER BY vid LIMIT 1) v ON TRUE WHERE d.ap=\'APPROVED\' AND d.av=\'AVAILABLE\' AND ST_DWithin(' + point + ',' + origin + ',$3) ORDER BY distance_km,d.did LIMIT $5';
  return (await pool.query(sql, [pickupLatitude,pickupLongitude,radiusKm * 1000,vehicleType,limit])).rows;
}
async function releaseAfterTrip(driverId, terminalAt) {
  // An old terminal event must not release a newer assignment.
  await pool.query("UPDATE driver SET av='AVAILABLE',u_at=CURRENT_TIMESTAMP WHERE did=$1 AND ap='APPROVED' AND av='BUSY' AND u_at<=$2::timestamptz", [driverId,terminalAt]);
}
module.exports = { findById,findByUserId,register,pending,approve,availability,markBusy,updateLocation,location,nearby,eligible,releaseAfterTrip };
