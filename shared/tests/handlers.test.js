'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {unary}=require('../grpc/handlers');const {AppError}=require('../errors/app-error');
test('shared unary maps unavailable/deadline failures and hides internal details',async()=>{
 for(const [http,grpc] of [[503,14],[504,4]]){
  const result=await new Promise(resolve=>unary(async()=>{throw new AppError('private SQL',{statusCode:http});})({request:{}},e=>resolve(e)));
  assert.equal(result.code,grpc);assert.equal(result.details,'Internal service error');
 }
});
