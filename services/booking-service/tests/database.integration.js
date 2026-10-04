'use strict';
const {test,after}=require('node:test');const assert=require('node:assert/strict');
const repo=require('../src/repositories/booking.repository');
const {pool,withTransaction,closeDatabase}=require('../src/config/database');
const created=[];
after(async()=>{if(created.length)await pool.query('DELETE FROM booking WHERE bid=ANY($1::bigint[])',[created]);await closeDatabase();});
async function booking(){
 const b=await repo.createBooking({customerId:'9223372036854775000',pickup:{latitude:0,longitude:0},destination:{latitude:1,longitude:1},vehicleType:'CAR'});
 created.push(b.bid);return b;
}
test('real booking_db: canonical persistence, logical IDs, history and no cross-domain foreign keys',async()=>{
 const b=await booking();assert.equal(b.s,'SEARCHING');assert.equal(b.vt,'CAR');
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'booking_db');
 assert.equal((await repo.findBookingById(b.bid)).cid,'9223372036854775000');
 const list=await repo.listCustomerBookings({customerId:b.cid,page:1,limit:1});assert.equal(list.rows.length,1);
 const fks=(await pool.query("SELECT c.confrelid::regclass::text AS target FROM pg_constraint c WHERE c.contype='f' AND c.conrelid IN ('booking'::regclass,'driver_offer'::regclass,'driver_assignment'::regclass)")).rows;
 assert.ok(fks.every(r=>['booking','driver_offer'].includes(r.target)));
 await assert.rejects(repo.findBookingById("1 OR 1=1"));assert.ok(await repo.findBookingById(b.bid));
});
test('real booking_db: exactly one Offer and Assignment despite concurrent inserts',async()=>{
 const b=await booking();
 const attempts=await Promise.allSettled([1,2].map(()=>repo.createDriverOffer({bookingId:b.bid,driverId:'9000',vehicleId:'9000'})));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.find(r=>r.status==='rejected').reason.code,'23505');
 const o=await repo.findOfferForBooking(b.bid);
 const assignments=await Promise.allSettled([1,2].map(()=>repo.createAssignment({bookingId:b.bid,offerId:o.oid,driverId:o.did,vehicleId:o.vid,assignedAt:new Date().toISOString()})));
 assert.equal(assignments.filter(r=>r.status==='fulfilled').length,1);assert.equal(assignments.find(r=>r.status==='rejected').reason.code,'23505');
});
test('real booking_db: aggregate lock serializes accept and failed transaction restores all local state',async()=>{
 const b=await booking(),o=await repo.createDriverOffer({bookingId:b.bid,driverId:'9000',vehicleId:'9000'});
 const read=[];
 await Promise.all([1,2].map(()=>withTransaction(async(client)=>{
  const locked=await repo.lockOfferById(o.oid,client);read.push(locked.s);
  if(locked.s==='OPEN'){const at=new Date().toISOString();await repo.markOfferAccepted(o.oid,at,client);
   await repo.createAssignment({bookingId:b.bid,offerId:o.oid,driverId:o.did,vehicleId:o.vid,assignedAt:at},client);
   await repo.setBookingStatus(b.bid,'ASSIGNED','SEARCHING',client,at);}
 })));
 assert.deepEqual(read,['OPEN','ACCEPTED']);assert.equal((await repo.findBookingById(b.bid)).s,'ASSIGNED');
 const other=await booking(),offer=await repo.createDriverOffer({bookingId:other.bid,driverId:'9001',vehicleId:'9001'});
 await assert.rejects(withTransaction(async(client)=>{
 await repo.lockOfferById(offer.oid,client);await repo.markOfferAccepted(offer.oid,new Date().toISOString(),client);throw new Error('intentional rollback');}));
 assert.equal((await repo.findOfferForBooking(other.bid)).s,'OPEN');assert.equal(await repo.findAssignmentByBookingId(other.bid),null);
});
