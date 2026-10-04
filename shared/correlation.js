'use strict';

const { randomUUID } = require('node:crypto');

function normalizeCorrelationId(value) {
  if (typeof value !== 'string') return null;
  if (/[\x00-\x1f\x7f]/.test(value)) return null;
  const id = value.trim();
  return /^[A-Za-z0-9._-]{1,128}$/.test(id) ? id : null;
}

function correlationId(value) {
  return normalizeCorrelationId(value) || randomUUID();
}

module.exports = { normalizeCorrelationId, correlationId };
