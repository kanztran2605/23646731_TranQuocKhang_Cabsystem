'use strict';
const jwt = require('jsonwebtoken');
function issueAccessToken({ userId, role }) {
  const secret = process.env.JWT_SECRET;
  const ttl = Number(process.env.JWT_ACCESS_TTL_SECONDS || 3600);
  if (!secret || !Number.isInteger(ttl) || ttl < 1) throw new Error('Invalid JWT configuration');
  return { accessToken: jwt.sign({ role }, secret, { algorithm: 'HS256', subject: String(userId), expiresIn: ttl }),
    expiresInSeconds: ttl };
}
module.exports = { issueAccessToken };
