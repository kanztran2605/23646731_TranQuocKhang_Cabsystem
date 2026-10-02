'use strict';

const {
  randomBytes,
  createHash,
} = require('node:crypto');

function createRawRefreshToken() {
  return randomBytes(48)
    .toString('base64url');
}

function hashRefreshToken(token) {
  return createHash('sha256')
    .update(String(token || ''))
    .digest('hex');
}

module.exports = {
  createRawRefreshToken,
  hashRefreshToken,
};