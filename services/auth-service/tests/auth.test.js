'use strict';
process.env.JWT_SECRET = 'isolated-auth-test-secret';
process.env.JWT_ACCESS_TTL_SECONDS = '3600';
process.env.BCRYPT_ROUNDS = '4';
const { test,beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuthService } = require('../src/services/auth.service');
const { createAuthGrpcHandlers } = require('../src/grpc/auth.grpc');
const { serve } = require('../../../shared/tests/grpc-service');
let users, service, queried;
beforeEach(async () => {
  const passwordHash = await bcrypt.hash('123',4);
  users = ['CUSTOMER','DRIVER','ADMIN'].map((role,i) => ({ uid: String(i+1),email: ['c@c.com','d@d.com','a@a.com'][i],pw_hash: passwordHash,role,s: 'ACTIVE',c_at: new Date() }));
  queried = [];
  service = createAuthService({
    async findByEmail(email) { queried.push(email); return users.find((u) => u.email === email); },
    async createAccount(input) {
      if (users.some((u) => u.email === input.email)) throw Object.assign(new Error(),{ code: '23505' });
      const row = { uid: '4',email: input.email,pw_hash: input.passwordHash,role: input.role,s: 'ACTIVE',c_at: new Date() };
      users.push(row); return row;
    },
  });
});
for (const [role,email] of [['CUSTOMER','c@c.com'],['DRIVER','d@d.com'],['ADMIN','a@a.com']]) {
  test(role+' login signs only required claims with configured expiry',async () => {
    const result = await service.login({ email,password: '123' });
    const claims = jwt.verify(result.accessToken,process.env.JWT_SECRET,{ algorithms: ['HS256'] });
    assert.deepEqual(Object.keys(claims).sort(),['exp','iat','role','sub']);
    assert.equal(claims.role,role); assert.equal(claims.sub,result.userId);
    assert.equal(claims.exp-claims.iat,3600); assert.equal(result.expiresInSeconds,3600);
    assert.ok(!JSON.stringify(result).includes('pw_hash'));
  });
}
for (const [label,email,password] of [['wrong password','c@c.com','wrong'],['unknown account','missing@c.com','123'],['SQL injection',"' OR 1=1 --",'123']]) {
  test(label+' is rejected without credential disclosure',async () => {
    await assert.rejects(service.login({ email,password }),(e) => e.statusCode === 401);
    assert.deepEqual(queried,[email.toLowerCase()]);
  });
}
test('registration stores bcrypt hash and returns only canonical Account fields',async () => {
  const result = await service.createAccount({ email: ' NEW@C.COM ',password: '123',role: 'CUSTOMER' });
  assert.deepEqual(Object.keys(result).sort(),['createdAt','email','role','status','userId']);
  assert.equal(result.email,'new@c.com');
  const row = users.at(-1); assert.notEqual(row.pw_hash,'123'); assert.ok(await bcrypt.compare('123',row.pw_hash));
});
test('email uniqueness is normalized and mapped to conflict',async () => {
  await assert.rejects(service.createAccount({ email: 'C@C.COM',password: '123',role: 'CUSTOMER' }),(e) => e.statusCode === 409);
});
test('registration validates role, email, required password and bcrypt byte bound',async () => {
  for (const input of [{ email:'bad',password:'123',role:'CUSTOMER' },{ email:'x@c.com',password:'123',role:'UNKNOWN' },
    { email:'x@c.com',password:'',role:'CUSTOMER' },{ email:'x@c.com',password:'x'.repeat(73),role:'CUSTOMER' }]) {
    await assert.rejects(service.createAccount(input),(e) => e.statusCode === 400);
  }
});
test('inactive account is rejected',async () => {
  users[0].s = 'INACTIVE';
  await assert.rejects(service.login({ email:'c@c.com',password:'123' }),(e) => e.statusCode === 401);
});

test('login rejects appended input beyond bcrypt 72-byte limit',async () => {
  const password = 'x'.repeat(72);
  await service.createAccount({ email:'bounded@c.com',password,role:'CUSTOMER' });
  assert.equal((await service.login({ email:'bounded@c.com',password })).role,'CUSTOMER');
  await assert.rejects(service.login({ email:'bounded@c.com',password:password+'wrong' }),(e) => e.statusCode === 401);
});
test('Auth exposes exactly the current two business RPCs',() => {
  assert.deepEqual(Object.keys(createAuthGrpcHandlers(service)).sort(),['createAccount','login']);
  assert.deepEqual(Object.keys(service).sort(),['createAccount','login']);
});
test('real Auth gRPC uses current contract, error codes and HealthService UP/DOWN',async (t) => {
  let healthy = true;
  const rpc = await serve(t,'auth.proto','cab.auth.v1','AuthService',createAuthGrpcHandlers(service),async () => { if (!healthy) throw new Error(); });
  const result = await rpc.call('login',{ email:'a@a.com',password:'123' }); assert.equal(result.role,'ADMIN');
  assert.equal((await rpc.call('createAccount',{ email:'rpc@c.com',password:'123',role:'CUSTOMER' })).status,'ACTIVE');
  await assert.rejects(rpc.call('login',{ email:'c@c.com',password:'wrong' }),(e) => e.code === 16);
  assert.equal((await rpc.checkHealth()).status,'UP'); healthy = false; assert.equal((await rpc.checkHealth()).status,'DOWN');
});
