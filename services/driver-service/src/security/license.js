'use strict';
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
function key() {
  const encoded = process.env.DATA_ENCRYPTION_KEY_BASE64;
  const value = Buffer.from(encoded || '', 'base64');
  if (value.length !== 32 || value.toString('base64') !== encoded) throw new Error('Invalid Driver encryption configuration');
  return value;
}
function encryptLicense(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), ciphertext.toString('base64'), cipher.getAuthTag().toString('base64')].join(':');
}
function decryptLicense(stored) {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid encrypted Driver license');
  const [, iv, ciphertext, tag] = parts.map((p, i) => i ? Buffer.from(p, 'base64') : p);
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted Driver license');
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
module.exports = { encryptLicense, decryptLicense };
