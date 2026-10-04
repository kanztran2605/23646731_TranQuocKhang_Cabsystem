'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {serve}=require('../../../shared/tests/grpc-service');
test('Booking Customer client validates by authenticated user and propagates correlation safely',async(t)=>{
 let request,metadata,fail=false;
 const rpc=await serve(t,'customer.proto','cab.customer.v1','CustomerService',{
 getCustomerByUserId(call,callback){request=call.request;metadata=call.metadata;
 if(fail)callback({code:5,details:'secret database credentials'});else callback(null,{customerId:'2',userId:request.userId,name:'Demo'});}
 });
 process.env.CUSTOMER_GRPC_HOST='127.0.0.1';process.env.CUSTOMER_GRPC_PORT=String(rpc.port);
 const client=require('../src/grpc/customer.client');t.after(()=>client.closeCustomerClient());
 assert.equal((await client.getCustomerByUserId('10','request-10')).customerId,'2');
 assert.deepEqual(request,{userId:'10',correlationId:'request-10'});
 assert.deepEqual(metadata.get('x-correlation-id'),['request-10']);
 fail=true;await assert.rejects(client.getCustomerByUserId('10','request-10'),e=>e.statusCode===404&&!e.message.includes('secret'));
});
