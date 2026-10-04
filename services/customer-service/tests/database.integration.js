'use strict';
const { test,after } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/customer.service');
const { pool,closeDatabase } = require('../src/config/database');
const created=[];
after(async () => { if (created.length) await pool.query('DELETE FROM customer_profile WHERE cid=ANY($1::bigint[])',[created]); await closeDatabase(); });
test('real customer_db: create/get logical user profile, validation and ownership',async () => {
  const userId=String(Date.now());
  const profile=await service.createCustomerProfile({ userId,name:'Integration Customer',address:'HCMC' }); created.push(profile.customerId);
  assert.deepEqual(Object.keys(profile).sort(),['address','createdAt','customerId','name','updatedAt','userId']);
  assert.equal((await service.getCustomer({ context:{ actorUserId:userId,actorRole:'CUSTOMER' },customerId:profile.customerId })).name,profile.name);
  assert.equal((await service.getCustomerByUserId({ userId })).customerId,profile.customerId);
  assert.equal((await service.validateCustomer({ customerId:profile.customerId })).valid,true);
  assert.equal((await service.validateCustomer({ customerId:'9223372036854775807' })).valid,false);
  await assert.rejects(service.getCustomer({ context:{ actorUserId:'999',actorRole:'CUSTOMER' },customerId:profile.customerId }),(e)=>e.statusCode===403);
  await assert.rejects(service.createCustomerProfile({ userId,name:'Duplicate' }),(e)=>e.statusCode===409);
  await assert.rejects(service.createCustomerProfile({ userId:'0',name:'X' }),(e)=>e.statusCode===400);
  await assert.rejects(service.getCustomerByUserId({ userId:'9223372036854775807' }),(e)=>e.statusCode===404);
});
test('real customer_db: only owned fields, no credentials and no cross-database FK',async () => {
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'customer_db');
  const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='customer_profile'")).rows.map((r)=>r.column_name).sort();
  // Recovery intentionally preserves the old owned DOB column and its data.
  for(const required of ['addr','c_at','cid','name','u_at','uid']) assert.ok(columns.includes(required));
  assert.ok(columns.every(column=>['addr','c_at','cid','date_of_birth','name','u_at','uid'].includes(column)));
  const foreignKeys=await pool.query("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='customer_profile' AND constraint_type='FOREIGN KEY'");
  assert.equal(foreignKeys.rowCount,0);
  await pool.query('SELECT 1');
});
