'use strict';
const {createPaymentService}=require('../src/services/payment.service');
const customer={actorUserId:'13',actorRole:'CUSTOMER',correlationId:'payment-test'};
const booking=()=>({bookingId:'20',customerId:'3',customerUserId:'13',createdAt:'2026-10-04T10:00:00Z'});
const completed=()=>({bookingId:'20',tripId:'1',customerId:'3',customerUserId:'13',driverId:'8',driverUserId:'14',completedAt:'2026-10-04T11:00:00Z'});
function fixture(){
 const state={rows:[],events:[],operations:[]};
 const repo={
  async create(p){if(state.rows.some(r=>r.bid===p.bookingId))return null;
   const row={pid:String(state.rows.length+1),bid:p.bookingId,cid:p.customerId,customer_uid:p.customerUserId,tid:null,amt:50000,eligible:false,s:'PENDING',ikey:null,c_at:p.createdAt,paid_at:null};state.rows.push(row);state.operations.push('payment.create');return {...row};},
  async byId(id){return structuredClone(state.rows.find(r=>r.pid===id)||null);},async byBooking(id){return structuredClone(state.rows.find(r=>r.bid===id)||null);},
  async lock(id){return this.byId(id);},async lockByBooking(id){return this.byBooking(id);},
  async eligible(id,tid){const row=state.rows.find(r=>r.pid===id);Object.assign(row,{tid,eligible:true});return {...row};},
  async key(id,key){if(state.rows.some(r=>r.ikey===key&&r.pid!==id))throw Object.assign(new Error('duplicate'),{code:'23505'});
   const row=state.rows.find(r=>r.pid===id);row.ikey=key;return {...row};},
  async complete(id,at){const row=state.rows.find(r=>r.pid===id);Object.assign(row,{s:'COMPLETED',paid_at:at});state.operations.push('payment.complete');return {...row};},
 };
 const transaction=async work=>{const before=structuredClone(state.rows);try{const r=await work({});state.operations.push('commit');return r;}catch(e){state.rows=before;throw e;}};
 const publish=async row=>{state.operations.push('payment.completed');state.events.push({...row});};
 const service=createPaymentService({repo,transaction,publish});
 const request=()=>({context:customer,paymentId:'1'});
 const eligible=async()=>{await service.bookingCreated(booking());await service.tripCompleted(completed());};
 return {state,repo,service,request,eligible};
}
module.exports={fixture,customer,booking,completed};
