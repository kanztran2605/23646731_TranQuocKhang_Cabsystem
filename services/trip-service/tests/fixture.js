'use strict';
const { createTripService } = require('../src/services/trip.service');
const customer = { actorUserId:'13',actorRole:'CUSTOMER',correlationId:'trip-test' };
const driver = { actorUserId:'14',actorRole:'DRIVER',correlationId:'trip-test' };
const assignment = () => ({ bookingId:'20',customerId:'3',driverId:'8',vehicleId:'9',customerUserId:'13',driverUserId:'14',acceptedAt:'2026-10-04T10:00:00Z' });
function fixture() {
  const state = { rows:[],history:[],locations:[],events:[],operations:[],driverCalls:[] };
  const repo = {
    async create(p) {
      if (state.rows.some(r => r.bid === p.bookingId)) return null;
      const row = { tid:'1',bid:p.bookingId,cid:p.customerId,did:p.driverId,vid:p.vehicleId,
        customer_uid:p.customerUserId,driver_uid:p.driverUserId,s:'ASSIGNED',paid:false,c_at:p.acceptedAt,u_at:p.acceptedAt };
      state.rows.push(row); state.operations.push('trip.persist'); return {...row};
    },
    async byId(id) { return structuredClone(state.rows.find(r=>r.tid===id) || null); },
    async byBooking(id) { return structuredClone(state.rows.find(r=>r.bid===id) || null); },
    async lock(id) { return this.byId(id); },
    async change(id,s,r,at) { const row=state.rows.find(r=>r.tid===id); Object.assign(row,{s,r,u_at:at});
      if(s==='COMPLETED') row.done_at=at; if(s==='CANCELED') row.can_at=at; state.operations.push('trip.persist');return {...row}; },
    async history(tid,from_s,to_s,chg_at) { state.history.push({hid:String(state.history.length+1),tid,from_s,to_s,chg_at});state.operations.push('history.persist'); },
    async listHistory(id) { return state.history.filter(r=>r.tid===id); },
    async location(tid,lat,lng) { const row={lid:'1',tid,lat,lng,rec_at:new Date().toISOString()};state.locations.push(row);return row; },
    async paid(id) { state.rows.find(r=>r.tid===id).paid=true; },
  };
  const transaction=async work => {
    const before=structuredClone({rows:state.rows,history:state.history,locations:state.locations});
    try { const r=await work({});state.operations.push('commit');return r; }
    catch(e){Object.assign(state,before);throw e;}
  };
  const publish=async (type,row,from,correlationId)=>{state.operations.push(type);state.events.push({type,row:{...row},from,correlationId});};
  const driverClient={async getDriverLocation(did,correlationId){state.driverCalls.push({did,correlationId});return {driverId:did,latitude:0,longitude:0};}};
  const service=createTripService({repo,transaction,publish,driver:driverClient});
  const request=(context=customer)=>({context,tripId:'1'});
  const advance=async()=>{await service.assigned(assignment());await service.updateTripStatus({...request(driver),status:'ARRIVED'});await service.updateTripStatus({...request(driver),status:'IN_PROGRESS'});};
  return {state,repo,service,request,advance};
}
module.exports={fixture,customer,driver,assignment};
