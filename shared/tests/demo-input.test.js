'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {phone,vehicleType,licensePlate}=require('../demo-input');
test('phone Việt Nam được chuẩn hóa; Customer có thể bỏ phone',()=>{
  for(const value of ['0901234567','+84 901 234 567','84901234567']) assert.equal(phone(value),'0901234567');
  assert.equal(phone(undefined,true),undefined);
  for(const value of [undefined,'123','abc','+840901234567'])assert.throws(()=>phone(value),{statusCode:400});
});
test('mặc định BIKE, CAR hợp lệ; biển số đơn giản và biển số cũ đều dùng được',()=>{
  assert.equal(vehicleType(undefined),'BIKE');assert.equal(vehicleType('CAR'),'CAR');
  for(const v of ['TRUCK','1',null])assert.throws(()=>vehicleType(v),{statusCode:400});
  assert.equal(licensePlate('59a12345'),'59A12345');assert.equal(licensePlate('51A-100.01'),'51A-100.01');
  for(const v of ['', '!!!', 'x'.repeat(21)])assert.throws(()=>licensePlate(v),{statusCode:400});
});
