'use strict';
const { AppError } = require('./errors/app-error');

function phone(value, optional = false) {
  if (optional && value == null) return undefined;
  if (typeof value !== 'string') throw AppError.badRequest('Số điện thoại không hợp lệ');
  let result = value.trim().replace(/[\s().-]/g, '');
  if (result.startsWith('+84')) result = '0' + result.slice(3);
  else if (result.startsWith('84')) result = '0' + result.slice(2);
  if (!/^(0[35789]\d{8}|02\d{9})$/.test(result)) throw AppError.badRequest('Số điện thoại Việt Nam không hợp lệ');
  return result;
}
function vehicleType(value) {
  if (value === undefined || value === '') return 'BIKE';
  if (!['BIKE', 'CAR'].includes(value)) throw AppError.badRequest('Loại xe chỉ nhận BIKE hoặc CAR');
  return value;
}
function licensePlate(value) {
  if (typeof value !== 'string') throw AppError.badRequest('Thiếu biển số xe');
  const result = value.trim().toUpperCase();
  if (!/^[A-Z0-9 .-]{3,20}$/.test(result) || !/[A-Z]/.test(result) || !/[0-9]/.test(result)) throw AppError.badRequest('Biển số xe không hợp lệ');
  return result;
}
function registrationId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw AppError.badRequest('Mã đăng ký không hợp lệ');
  }
  return value;
}
module.exports = { phone, vehicleType, licensePlate, registrationId };
