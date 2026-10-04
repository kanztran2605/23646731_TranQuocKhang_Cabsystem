'use strict';

const { z } = require('zod');
const { AppError } = require('../../../../shared/errors/app-error');
const { buildRequestContext } = require('../clients/grpc-clients');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw AppError.badRequest();
  return result.data;
}

const idSchema = z.string().regex(/^[1-9]\d*$/).max(19)
  .refine((value) => value.length <= 19 && /^\d+$/.test(value) && BigInt(value) <= 9223372036854775807n);
function pathId(req, name) { return parse(idSchema, req.params[name]); }
const locationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
const vehicleType = z.string().trim().min(1).refine((value) => !/^\d+$/.test(value));
const email = z.string().trim().email();
function queryNumber(schema) { return z.string().trim().min(1).transform(Number).pipe(schema); }
const page = queryNumber(z.number().int().min(1).max(2147483647)).default('1');
function pagination(defaultLimit = 5, maxLimit = 2147483647) {
  return z.object({ page, limit: queryNumber(z.number().int().min(1).max(maxLimit)).default(String(defaultLimit)) });
}
function location(value) { return { latitude: value.lat, longitude: value.lng }; }
function publicLocation(value) { return { lat: value.latitude, lng: value.longitude }; }
function publicId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw AppError.internal();
  return id;
}
function nullableId(value) { return value ? publicId(value) : null; }

module.exports = { z, parse, asyncHandler, pathId, locationSchema, location, publicLocation,
  vehicleType, email, queryNumber, pagination, publicId, nullableId, context: buildRequestContext };
