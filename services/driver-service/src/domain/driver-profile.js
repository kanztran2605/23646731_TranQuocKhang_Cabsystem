'use strict';

const {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} = require('node:crypto');

function encryptionKey() {
  const encoded =
    process.env.DATA_ENCRYPTION_KEY_BASE64;

  if (!encoded) {
    throw new Error(
      'DATA_ENCRYPTION_KEY_BASE64 is required',
    );
  }

  const key =
    Buffer.from(
      encoded,
      'base64',
    );

  if (key.length !== 32) {
    throw new Error(
      'DATA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes',
    );
  }

  return key;
}

function encryptionKeyVersion() {
  const version =
    Number(
      process.env
        .DATA_ENCRYPTION_KEY_VERSION ||
        1,
    );

  if (
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new Error(
      'DATA_ENCRYPTION_KEY_VERSION must be an integer >= 1',
    );
  }

  return version;
}

function encryptDriverLicense(value) {
  const plaintext =
    String(value || '').trim();

  if (!plaintext) {
    throw new TypeError(
      'driverLicense must not be empty',
    );
  }

  const version =
    encryptionKeyVersion();

  const iv =
    randomBytes(12);

  const cipher =
    createCipheriv(
      'aes-256-gcm',
      encryptionKey(),
      iv,
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        plaintext,
        'utf8',
      ),
      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return {
    ciphertext: [
      `v${version}`,
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':'),

    keyVersion: version,
  };
}

function decryptDriverLicense(value) {
  if (
    !value ||
    typeof value !== 'string'
  ) {
    return undefined;
  }

  const parts =
    value.split(':');

  if (
    parts.length !== 4 ||
    !/^v\d+$/.test(parts[0])
  ) {
    return undefined;
  }

  try {
    const iv =
      Buffer.from(
        parts[1],
        'base64',
      );

    const tag =
      Buffer.from(
        parts[2],
        'base64',
      );

    const encrypted =
      Buffer.from(
        parts[3],
        'base64',
      );

    const decipher =
      createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        iv,
      );

    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch (_error) {
    return undefined;
  }
}

module.exports = {
  encryptDriverLicense,
  decryptDriverLicense,
};