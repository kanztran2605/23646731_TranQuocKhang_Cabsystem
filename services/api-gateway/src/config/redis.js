'use strict';

const {
  createClient,
} = require('redis');

const env = require('./env');

const {
  createLogger,
} = require('../../../../shared/logging/logger');

const logger =
  createLogger(env.SERVICE_NAME);

let client = null;
let connectPromise = null;

function getRedisClient() {
  if (client) {
    return client;
  }

  client = createClient({
    socket: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,

      reconnectStrategy(retries) {
        return Math.min(
          retries * 100,
          3000,
        );
      },
    },

    password: env.REDIS_PASSWORD,
  });

  client.on('error', (error) => {
    logger.error(
      'Redis client error',
      { error },
    );
  });

  client.on('reconnecting', () => {
    logger.warn(
      'Redis reconnecting',
    );
  });

  client.on('ready', () => {
    logger.info(
      'Redis ready',
      {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
      },
    );
  });

  return client;
}

async function connectRedis() {
  const redis =
    getRedisClient();

  if (redis.isReady) {
    return redis;
  }

  if (!connectPromise) {
    connectPromise =
      redis
        .connect()
        .then(() => redis)
        .finally(() => {
          connectPromise = null;
        });
  }

  return connectPromise;
}

async function pingRedis() {
  const redis =
    await connectRedis();

  const result =
    await redis.ping();

  return result === 'PONG';
}

async function closeRedis() {
  if (!client) {
    return;
  }

  try {
    if (client.isOpen) {
      await client.quit();
    }
  } finally {
    client = null;
    connectPromise = null;
  }
}

module.exports = {
  getRedisClient,
  connectRedis,
  pingRedis,
  closeRedis,
};