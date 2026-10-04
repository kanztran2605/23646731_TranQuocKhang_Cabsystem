'use strict';
const { AppError } = require('../../../../shared/errors/app-error');
function checkKey(row, requested) {
  if (row.ikey === requested) return true;
  if (row.ikey != null) throw AppError.conflict('Payment already uses another idempotency key');
  return false;
}
module.exports = { checkKey };
