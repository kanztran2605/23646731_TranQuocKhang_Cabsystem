'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),bcrypt=require('bcryptjs');
const {passwordEvidence}=require('../src/services/password-evidence');
const {createAuthService}=require('../src/services/auth.service');
const {createAuthGrpcHandlers}=require('../src/grpc/auth.grpc');
const {serve}=require('../../../shared/tests/grpc-service');
const admin={actorUserId:'1',actorRole:'ADMIN'};

test('Bằng chứng bcrypt từ dữ liệu thật, che toàn bộ digest và ghi đúng phạm vi',async()=>{
  const hash=await bcrypt.hash('PASSWORD-CANARY',4);
  const result=passwordEvidence([{pw_hash:hash}]);
  assert.equal(result.status,'PASS');assert.equal(result.bcryptCount,1);
  assert.ok(result.maskedFormat.startsWith(hash.slice(0,7)));
  assert.ok(!JSON.stringify(result).includes(hash));assert.ok(!JSON.stringify(result).includes('PASSWORD-CANARY'));
  assert.match(result.scope,/pw_hash/);
});
test('Không có dữ liệu là UNVERIFIED; giá trị sai không thể PASS và không được trả ra',()=>{
  assert.equal(passwordEvidence([]).status,'UNVERIFIED');
  const result=passwordEvidence([{pw_hash:'PLAINTEXT-CANARY'}]);
  assert.equal(result.status,'FAIL');assert.equal(result.invalidCount,1);
  assert.ok(!JSON.stringify(result).includes('PLAINTEXT-CANARY'));
});
test('Evidence Auth yêu cầu cờ demo + ADMIN, gRPC chỉ trả metadata an toàn',async t=>{
  const old=process.env.DEMO_SECURITY_ENABLED;t.after(()=>{if(old===undefined)delete process.env.DEMO_SECURITY_ENABLED;else process.env.DEMO_SECURITY_ENABLED=old;});
  const hash=await bcrypt.hash('123',4);let reads=0;
  const service=createAuthService({passwordEvidenceRows:async()=>{reads++;return [{pw_hash:hash}];}});
  delete process.env.DEMO_SECURITY_ENABLED;
  await assert.rejects(service.getPasswordAtRestEvidence({context:admin}),{statusCode:404});
  process.env.DEMO_SECURITY_ENABLED='true';
  for(const role of ['CUSTOMER','DRIVER'])await assert.rejects(service.getPasswordAtRestEvidence({context:{actorUserId:'2',actorRole:role}}),{statusCode:403});
  await assert.rejects(service.getPasswordAtRestEvidence({}),{statusCode:401});assert.equal(reads,0);
  const rpc=await serve(t,'auth.proto','cab.auth.v1','AuthService',createAuthGrpcHandlers(service));
  const result=await rpc.call('getPasswordAtRestEvidence',{context:admin});
  assert.equal(result.status,'PASS');assert.equal(result.checkedCount,1);
  assert.ok(!JSON.stringify(result).includes(hash));assert.equal(reads,1);
});
