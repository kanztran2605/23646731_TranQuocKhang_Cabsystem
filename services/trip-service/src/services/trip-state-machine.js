'use strict';
const { AppError } = require('../../../../shared/errors/app-error');
const NEXT = Object.freeze({ ASSIGNED: 'ARRIVED', ARRIVED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED' });
function transition(from, to) {
  if (!['ARRIVED','IN_PROGRESS','COMPLETED'].includes(to)) throw AppError.badRequest('Invalid Trip status');
  if (['COMPLETED','CANCELED'].includes(from)) throw AppError.conflict('Trip is terminal');
  if (NEXT[from] !== to) throw AppError.badRequest('Invalid Trip transition');
}
function cancellation(from) {
  if (!Object.hasOwn(NEXT, from)) throw AppError.conflict('Trip cannot be canceled');
}
module.exports = { transition, cancellation };
