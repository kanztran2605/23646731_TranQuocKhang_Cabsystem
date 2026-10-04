'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomInt}=require('node:crypto');
const {pool,closeDatabase}=require('../src/config/database');
const {createReviewRepository}=require('../src/repositories/review.repository');
const repo=createReviewRepository(),created=[];
after(async()=>{if(created.length)await pool.query('DELETE FROM review WHERE tid=ANY($1::bigint[])',[created]);await closeDatabase();});
test('real review_db: concurrent inserts enforce one Review per Trip and parameterized plain-text persistence',async()=>{
 const tripId=String(820000000000+randomInt(100000000));created.push(tripId);const input={tripId,customerId:'900000',driverId:'900001',score:5,comment:"ok ' OR 1=1 --"};
 const results=await Promise.allSettled([repo.create(input),repo.create(input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'23505');
 const row=(await pool.query('SELECT * FROM review WHERE tid=$1',[tripId])).rows[0];assert.equal(row.cmt,input.comment);assert.equal(row.did,'900001');
 await assert.rejects(repo.create({...input,tripId:String(BigInt(tripId)+1n),score:6}),{code:'23514'});
 assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'review_db');
});
