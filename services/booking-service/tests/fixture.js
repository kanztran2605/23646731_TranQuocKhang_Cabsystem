'use strict';
const assert = require('node:assert/strict');
const { createBookingService } = require('../src/services/booking.service');
const { createMatchingService } = require('../src/services/driver-matching.service');
const { AppError } = require('../../../shared/errors/app-error');
const customerContext = { actorUserId: '10', actorRole: 'CUSTOMER', correlationId: 'booking-test' };
const driverContext = { actorUserId: '12', actorRole: 'DRIVER', correlationId: 'booking-test' };
function fixture() {
  const state = { bookings: [], offers: [], assignments: [], events: [], operations: [], customerCalls: [],
    searches: [], busyCalls: [], driver: { driverId: '7', userId: '12', approvalStatus: 'APPROVED', availabilityStatus: 'AVAILABLE' },
    candidates: [{ userId: '12', driverId: '7', vehicleId: '9', vehicleType: 'CAR', distanceKm: 0.1 }] };
  const repo = {
    async createBooking(input) {
      const row = { bid: '20', cid: input.customerId, p_lat: input.pickup.latitude, p_lng: input.pickup.longitude,
        d_lat: input.destination.latitude, d_lng: input.destination.longitude, vt: input.vehicleType, s: 'SEARCHING', c_at: new Date('2026-10-04T10:00:00Z') };
      state.operations.push('booking.persist'); state.bookings.push(row); return row;
    },
    async findBookingById(id) { const row = state.bookings.find((b) => b.bid === String(id));
      return row ? { ...row, ...(state.offers[0] ? { oid: state.offers[0].oid, did: state.offers[0].did } : {}) } : null; },
    async lockBookingById(id) { return state.bookings.find((b) => b.bid === String(id)); },
    async setBookingStatus(id, status, expected, _client, assignedAt) {
      const row = state.bookings.find((b) => b.bid === String(id));
      if (!row || row.s !== expected) return null;
      row.s = status; if (assignedAt) row.ass_at = assignedAt; state.operations.push('booking.' + status); return row;
    },
    async findOfferForBooking() { return state.offers[0] || null; },
    async createDriverOffer(input) {
      state.operations.push('offer.persist');
      const row = { oid: '8', bid: String(input.bookingId), did: String(input.driverId), vid: String(input.vehicleId), s: 'OPEN', c_at: new Date('2026-10-04T10:00:01Z') };
      state.offers.push(row); return row;
    },
    async lockOfferById(id) { const offer = state.offers.find((o) => o.oid === id);
      return offer ? { ...offer, cid: state.bookings[0].cid, booking_status: state.bookings[0].s } : null; },
    async findAssignmentByBookingId() { return state.assignments[0] || null; },
    async findAssignmentByOfferId() { return state.assignments[0] || null; },
    async markOfferAccepted(id, at) { state.operations.push('offer.accept'); const row=state.offers[0]; row.s='ACCEPTED'; row.acc_at=at; return row; },
    async createAssignment(input) {
      state.operations.push('assignment.persist');
      const row={ aid:'30',bid:String(input.bookingId),oid:String(input.offerId),did:String(input.driverId),vid:String(input.vehicleId),ass_at:input.assignedAt };
      state.assignments.push(row); return row;
    },
    async listOpenOffersByDriver(id) { return state.offers.filter((o)=>o.did===id && o.s==='OPEN'); },
    async driverHasOfferForBooking(bid,did) { return state.offers.some((o)=>o.bid===String(bid)&&o.did===did); },
    async listCustomerBookings(input) { state.listInput=input; const rows=state.bookings.filter((b)=>b.cid===input.customerId);
      return { total: rows.length, rows: rows.slice((input.page-1)*input.limit,input.page*input.limit) }; },
  };
  const customer = { async validateCustomer(customerId) { return { valid:true,customerId,userId:'10' }; }, async getCustomerByUserId(userId,correlationId) {
    state.customerCalls.push({userId,correlationId}); if(state.customerError) throw state.customerError;
    return state.customerMissing ? null : { customerId:'2',userId:state.customerUserId || userId };
  } };
  const driver = {
    async getMyDriverProfile() { return state.driver; },
    async findEligibleDrivers(input) { state.searches.push(input); if(state.searchError)throw state.searchError; return {items:state.candidates}; },
    async markBusyForAssignment(context,id) { state.operations.push('driver.busy'); state.busyCalls.push({context,id});
      if(state.busyError)throw state.busyError; state.driver.availabilityStatus='BUSY'; return {...state.driver}; },
  };
  const publish = {};
  for(const [method,type] of [['publishBookingCreated','booking.created'],['publishOfferCreated','offer.created'],['publishDriverAccepted','driver.accepted']]) {
    publish[method]=async (input)=>{
      if(state.publishFailure===type)throw new Error('secret database address');
      assert.ok(state.bookings.length);
      if(type==='offer.created')assert.ok(state.offers.length);
      if(type==='driver.accepted')assert.ok(state.assignments.length);
      state.operations.push(type); state.events.push({type,input});
    };
  }
  const transaction=async (work)=>{
    const snapshot=structuredClone({bookings:state.bookings,offers:state.offers,assignments:state.assignments});
    state.operations.push('begin');
    try { const result=await work({}); state.operations.push('commit'); return result; }
    catch(e) {Object.assign(state,snapshot);state.operations.push('rollback');throw e;}
  };
  const deps={repo,customer,driver,publish,transaction};
  return {state,...deps,service:createBookingService(deps),matching:createMatchingService(deps)};
}
const input = () => ({context:{...customerContext},pickup:{latitude:10.76,longitude:106.68},destination:{latitude:10.77,longitude:106.7},vehicleType:'CAR'});
module.exports={fixture,input,customerContext,driverContext,AppError};
