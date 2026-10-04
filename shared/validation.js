'use strict';
const { AppError } = require('./errors/app-error');
function id(value) {
  const text = String(value ?? '');
  if (!/^[1-9]\d{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n) throw AppError.badRequest('Invalid identifier');
  return text;
}
function text(value, max, optional = false) {
  if (optional && (value === undefined || value === null)) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw AppError.badRequest();
  return value.trim();
}
function actor(context, roles) {
  if (!context?.actorUserId || !context?.actorRole) throw AppError.unauthorized();
  id(context.actorUserId);
  if (!roles.includes(context.actorRole)) throw AppError.forbidden();
  return context.actorUserId;
}
function coordinates(latitude, longitude) {
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw AppError.badRequest('Invalid coordinates');
}
function paging(page = 1, limit = 5) {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 20) throw AppError.badRequest('Invalid pagination');
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw AppError.badRequest('Invalid pagination');
  return { page, limit, offset };
}
module.exports = { id, text, actor, coordinates, paging };
