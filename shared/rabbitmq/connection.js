'use strict';

const amqp = require('amqplib');

const {
  createLogger,
} = require('../logging/logger');

const logger = createLogger(
  process.env.SERVICE_NAME || 'cab-system',
);

const EXCHANGE =
  process.env.RABBITMQ_EXCHANGE || 'cab.events';

const EXCHANGE_TYPE =
  process.env.RABBITMQ_EXCHANGE_TYPE || 'topic';

let connectionPromise = null;

function buildRabbitMqUrl() {
  const host =
    process.env.RABBITMQ_HOST || 'rabbitmq';

  const port =
    process.env.RABBITMQ_PORT || '5672';

  const user = encodeURIComponent(
    process.env.RABBITMQ_USER || 'guest',
  );

  const password = encodeURIComponent(
    process.env.RABBITMQ_PASSWORD || 'guest',
  );

  return `amqp://${user}:${password}@${host}:${port}`;
}

async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = amqp
      .connect(buildRabbitMqUrl())
      .then((connection) => {
        logger.info('RabbitMQ connected', {
          host:
            process.env.RABBITMQ_HOST ||
            'rabbitmq',

          port:
            process.env.RABBITMQ_PORT ||
            '5672',

          exchange: EXCHANGE,
        });

        connection.on('error', (error) => {
          logger.error(
            'RabbitMQ connection error',
            { error },
          );
        });

        connection.on('close', () => {
          logger.warn(
            'RabbitMQ connection closed',
          );

          connectionPromise = null;
        });

        return connection;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
}

async function assertExchange(channel) {
  await channel.assertExchange(
    EXCHANGE,
    EXCHANGE_TYPE,
    {
      durable: true,
    },
  );

  return EXCHANGE;
}

async function createChannel({
  confirm = false,
} = {}) {
  const connection =
    await getConnection();

  const channel = confirm
    ? await connection.createConfirmChannel()
    : await connection.createChannel();

  await assertExchange(channel);

  return channel;
}

async function closeConnection() {
  if (!connectionPromise) {
    return;
  }

  const current = connectionPromise;
  connectionPromise = null;

  try {
    const connection = await current;
    await connection.close();
  } catch (error) {
    logger.warn(
      'RabbitMQ connection close failed',
      { error },
    );
  }
}

module.exports = {
  EXCHANGE,
  EXCHANGE_TYPE,
  buildRabbitMqUrl,
  getConnection,
  assertExchange,
  createChannel,
  closeConnection,
};