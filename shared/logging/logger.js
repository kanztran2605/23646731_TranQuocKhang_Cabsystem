'use strict';

const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

const REDACTED_KEYS = new Set([
  'pw',
  'pwhash',
  'jwtsecret',
  'dataencryptionkeybase64',
  'dataencryptionlegacykeybase64',
  'lic',
  'license',
  'licenc',
  'driverlicenseciphertext',
  'driverlicense',
  'decryptedlicense',
  'password',
  'passwordhash',
  'authorization',
  'cookie',
  'token',
  'accesstoken',
  'refreshtoken',
  'verificationtoken',
  'jwt',
  'otp',
  'secret',
  'apikey',
  'providersignature',
  'dataencryptionkey',
  'internalservicekey',
]);

function normalizeLevel(value) {
  const level = String(value || 'info').toLowerCase();

  return Object.prototype.hasOwnProperty.call(
    LEVELS,
    level,
  )
    ? level
    : 'info';
}

function serializeError(error) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    code: error.code,
    statusCode: error.statusCode,
    ...(error.cause
      ? { cause: error.cause }
      : {}),
  };
}

function redact(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const output = redact(serializeError(value), seen);
    seen.delete(value);
    return output;
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key
      .replace(/[_-]/g, '')
      .toLowerCase();

    output[key] = (REDACTED_KEYS.has(normalizedKey) || normalizedKey.endsWith('password') || normalizedKey.endsWith('secret'))
      ? '[REDACTED]'
      : redact(item, seen);
  }

  seen.delete(value);

  return output;
}

function createLogger(
  serviceName = process.env.SERVICE_NAME || 'cab-system',
  base = {},
) {
  const configuredLevel = normalizeLevel(
    process.env.LOG_LEVEL,
  );

  const threshold = LEVELS[configuredLevel];

  function write(level, message, meta = {}) {
    if (LEVELS[level] < threshold) {
      return;
    }

    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: serviceName,
      message: String(message),
      ...redact(base),
      ...redact(meta),
    };

    const line = JSON.stringify(record);

    if (level === 'error') {
      process.stderr.write(`${line}\n`);
      return;
    }

    process.stdout.write(`${line}\n`);
  }

  return Object.freeze({
    debug: (message, meta) =>
      write('debug', message, meta),

    info: (message, meta) =>
      write('info', message, meta),

    warn: (message, meta) =>
      write('warn', message, meta),

    error: (message, meta) =>
      write('error', message, meta),

    child: (childBase = {}) =>
      createLogger(serviceName, {
        ...base,
        ...childBase,
      }),
  });
}

const logger = createLogger();

module.exports = {
  createLogger,
  logger,
  redact,
};
