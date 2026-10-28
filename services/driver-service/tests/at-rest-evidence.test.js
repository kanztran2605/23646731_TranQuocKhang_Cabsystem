'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {encryptLicense}=require('../src/security/license');
const {licenseEvidence}=require('../src/security/at-rest-evidence');
const {createDriverService}=require('../src/services/driver.service');
const {createDriverGrpcHandlers}=require('../src/grpc/driver.grpc');
const {serve}=require('../../../shared/tests/grpc-service');
function key(t){const old=process.env.DATA_ENCRYPTION_KEY_BASE64;process.env.DATA_ENCRYPTION_KEY_BASE64=randomBytes(32).toString('base64');t.after(()=>{if(old===undefined)delete process.env.DATA_ENCRYPTION_KEY_BASE64;else process.env.DATA_ENCRYPTION_KEY_BASE64=old;});}
test('AES-GCM xác thực ciphertext thật; không trả license/key/ciphertext/IV/tag',t=>{
  key(t);const encrypted=encryptLicense('LICENSE-CANARY');
  const result=licenseEvidence([{lic_enc:encrypted},{lic_enc:null}]);
  assert.equal(result.status,'PASS');assert.equal(result.authenticatedCount,1);assert.equal(result.missingCount,1);
  assert.equal(result.keyManagement.valid,true);assert.equal(result.keyManagement.status,'UNVERIFIED');
  assert.equal(result.keyManagement.hardcodedKeyCheck,'UNVERIFIED');
  const json=JSON.stringify(result);
  for(const value of [encrypted,'LICENSE-CANARY',process.env.DATA_ENCRYPTION_KEY_BASE64,...encrypted.split(':').slice(1)])assert.ok(!json.includes(value));
});
test('Dữ liệu trống/khóa thiếu là UNVERIFIED; ciphertext hoặc plaintext sai là FAIL',t=>{
  key(t);assert.equal(licenseEvidence([{lic_enc:null}]).status,'UNVERIFIED');
  const parts=encryptLicense('X').split(':');parts[3]=Buffer.alloc(16).toString('base64');
  const result=licenseEvidence([{lic_enc:parts.join(':')},{lic_enc:'PLAINTEXT-CANARY'}]);
  assert.equal(result.status,'FAIL');assert.equal(result.invalidCount,2);assert.ok(!JSON.stringify(result).includes('PLAINTEXT-CANARY'));
  delete process.env.DATA_ENCRYPTION_KEY_BASE64;
  const missing=licenseEvidence([{lic_enc:'v1:bad'}]);
  assert.equal(missing.status,'UNVERIFIED');assert.equal(missing.keyManagement.status,'FAIL');
});
test('Driver evidence gated/ADMIN tại service và gRPC, không phát event hoặc ghi DB',async t=>{
  key(t);const old=process.env.DEMO_SECURITY_ENABLED;t.after(()=>{if(old===undefined)delete process.env.DEMO_SECURITY_ENABLED;else process.env.DEMO_SECURITY_ENABLED=old;});
  let reads=0;const encrypted=encryptLicense('SAFE-DEMO');
  const service=createDriverService({licenseEvidenceRows:async()=>{reads++;return [{lic_enc:encrypted}];}},async()=>assert.fail('Không phát event'));
  const context={actorUserId:'1',actorRole:'ADMIN'};
  process.env.DEMO_SECURITY_ENABLED='false';await assert.rejects(service.getLicenseAtRestEvidence({context}),{statusCode:404});
  process.env.DEMO_SECURITY_ENABLED='true';
  for(const role of ['DRIVER','CUSTOMER'])await assert.rejects(service.getLicenseAtRestEvidence({context:{...context,actorRole:role}}),{statusCode:403});
  await assert.rejects(service.getLicenseAtRestEvidence({}),{statusCode:401});assert.equal(reads,0);
  const rpc=await serve(t,'driver.proto','cab.driver.v1','DriverService',createDriverGrpcHandlers(service));
  assert.equal((await rpc.call('getLicenseAtRestEvidence',{context})).status,'PASS');assert.equal(reads,1);
});
