'use strict';

const { createClient } = require('redis');
const env = require('./env');
const { createLogger } = require('../../../../shared/logging/logger');
const logger = createLogger(env.SERVICE_NAME);
let client;
let connectPromise;

function getRedisClient() {
  if (!client) {
    client = createClient({
      socket: {
        host: env.REDIS_HOST, port: env.REDIS_PORT, connectTimeout: 1500,
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
      password: env.REDIS_PASSWORD,
      disableOfflineQueue: true,
    });
    client.on('error', () => logger.warn('Redis connection unavailable'));
    client.on('ready', () => logger.info('Redis ready'));
  }
  return client;
}

function connectRedis() {
  const redis = getRedisClient();
  if (redis.isReady) return Promise.resolve(redis);
  if (connectPromise) return connectPromise;
  if (redis.isOpen) return Promise.resolve(redis);
  connectPromise = redis.connect().then(() => redis).finally(() => { connectPromise = null; });
  return connectPromise;
}

async function pingRedis() {
  const redis = getRedisClient();
  if (!redis.isReady) return false;
  let timer;
  try {
    return await Promise.race([
      redis.ping().then((reply) => reply === 'PONG'),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), 1500); }),
    ]);
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function closeRedis() {
  if (client?.isOpen) await client.disconnect();
  client = undefined;
  connectPromise = undefined;
}

module.exports = { getRedisClient, connectRedis, pingRedis, closeRedis };
