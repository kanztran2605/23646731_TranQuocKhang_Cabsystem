'use strict';
const { test,after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const service = require('../src/services/auth.service');
const { pool,closeDatabase } = require('../src/config/database');
const { health } = require('../../../shared/grpc/handlers');
const created=[];
after(async () => { if (created.length) await pool.query('DELETE FROM user_account WHERE uid=ANY($1::bigint[])',[created]); await closeDatabase(); });
test('real auth_db: seeded three roles login, bcrypt compatibility and minimal signed JWT',async () => {
  for (const [email,role] of [['c@c.com','CUSTOMER'],['d@d.com','DRIVER'],['a@a.com','ADMIN']]) {
    const result=await service.login({ email,password:'123' });
    const claims=jwt.verify(result.accessToken,process.env.JWT_SECRET);
    assert.equal(claims.role,role); assert.deepEqual(Object.keys(claims).sort(),['exp','iat','role','sub']);
  }
});
test('real auth_db: account hash, unique email and parameterized injection protection',async () => {
  const email='test-'+Date.now()+'@auth.test';
  const result=await service.createAccount({ email,password:'123',role:'CUSTOMER' }); created.push(result.userId);
  const row=(await pool.query('SELECT * FROM user_account WHERE uid=$1',[result.userId])).rows[0];
  assert.notEqual(row.pw_hash,'123'); assert.ok(await bcrypt.compare('123',row.pw_hash));
  await assert.rejects(service.createAccount({ email,password:'123',role:'CUSTOMER' }),(e) => e.statusCode===409);
  for (const input of [{ email,password:'wrong' },{ email:'missing@auth.test',password:'123' },{ email:"' OR 1=1 --",password:'123' }]) {
    await assert.rejects(service.login(input),(e) => e.statusCode===401);
  }
  assert.ok(!JSON.stringify(result).includes(row.pw_hash));
  const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='user_account'")).rows.map((r) => r.column_name);
  assert.ok(columns.includes('pw_hash')); assert.ok(!columns.includes('password'));
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'auth_db');
});
test('real auth_db: HealthService returns UP',async () => {
  const result=await new Promise((resolve,reject) => health(async () => { await pool.query('SELECT 1'); }).check({},(e,r) => e?reject(e):resolve(r)));
  assert.equal(result.status,'UP');
});
