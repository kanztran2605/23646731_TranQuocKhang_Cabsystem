'use strict';

const {
  createLogger,
} = require('../logging/logger');

const {
  createChannel,
  EXCHANGE,
} = require('./connection');

const {
  EVENT_PRODUCERS,
  validateEventEnvelope,
} = require('./publisher');

function normalizeRoutingKeys(
  routingKeys,
) {
  const values =
    Array.isArray(routingKeys)
      ? routingKeys
      : [routingKeys];

  const unique = [
    ...new Set(
      values.filter(Boolean),
    ),
  ];

  if (unique.length === 0) {
    throw new TypeError(
      'At least one routing key is required',
    );
  }

  for (
    const routingKey
    of unique
  ) {
    if (
      !EVENT_PRODUCERS[
        routingKey
      ]
    ) {
      throw new Error(
        `Unsupported CAB event routing key: ${routingKey}`,
      );
    }
  }

  return unique;
}

async function consumeEvents({
  serviceName =
    process.env.SERVICE_NAME ||
    'cab-system',

  queue,

  routingKeys,

  handler,

  prefetch = 10,

  queueOptions = {},

  consumerOptions = {},

  requeueOnError = true,

  idempotency,

  handlerManagesIdempotency =
    false,
}) {
  if (
    !queue ||
    typeof queue !== 'string'
  ) {
    throw new TypeError(
      'queue must be a non-empty string',
    );
  }

  if (
    typeof handler !== 'function'
  ) {
    throw new TypeError(
      'handler must be a function',
    );
  }

  if (
    !Number.isInteger(prefetch) ||
    prefetch < 1
  ) {
    throw new TypeError(
      'prefetch must be an integer >= 1',
    );
  }

  /*
   * AsyncAPI contract:
   * every consumer must be idempotent.
   *
   * A consumer must therefore either:
   *
   * 1. provide isProcessed + markProcessed
   *
   * or
   *
   * 2. explicitly declare that its domain
   *    handler provides idempotency itself.
   */
  const hasSharedIdempotency =
    Boolean(
      idempotency &&
      typeof idempotency
        .isProcessed ===
        'function' &&
      typeof idempotency
        .markProcessed ===
        'function',
    );

  if (
    !hasSharedIdempotency &&
    handlerManagesIdempotency !==
      true
  ) {
    throw new Error(
      'RabbitMQ consumer must declare an idempotency strategy: ' +
      'provide idempotency.isProcessed/markProcessed or ' +
      'set handlerManagesIdempotency=true',
    );
  }

  const bindings =
    normalizeRoutingKeys(
      routingKeys,
    );

  const logger =
    createLogger(serviceName);

  const channel =
    await createChannel();

  channel.on(
    'error',
    (error) => {
      logger.error(
        'RabbitMQ consumer channel error',
        {
          queue,
          error,
        },
      );
    },
  );

  channel.on(
    'close',
    () => {
      logger.warn(
        'RabbitMQ consumer channel closed',
        {
          queue,
        },
      );
    },
  );

  await channel.prefetch(
    prefetch,
  );

  const assertedQueue =
    await channel.assertQueue(
      queue,
      {
        ...queueOptions,

        /*
         * CAB business-event
         * queues are durable.
         */
        durable: true,
      },
    );

  for (
    const routingKey
    of bindings
  ) {
    await channel.bindQueue(
      assertedQueue.queue,
      EXCHANGE,
      routingKey,
    );
  }

  const result =
    await channel.consume(
      assertedQueue.queue,

      async (message) => {
        if (!message) {
          return;
        }

        const routingKey =
          message.fields.routingKey;

        let event;

        try {
          event = JSON.parse(
            message.content.toString(
              'utf8',
            ),
          );

          validateEventEnvelope(
            event,
            routingKey,
          );
        } catch (error) {
          logger.error(
            'Rejected invalid RabbitMQ event',
            {
              queue,
              routingKey,
              error,
            },
          );

          /*
           * Invalid JSON or an event
           * violating the locked contract
           * will not become valid by retry.
           */
          channel.nack(
            message,
            false,
            false,
          );

          return;
        }

        const logContext = {
          queue,

          eventId:
            event.eventId,

          eventType:
            event.eventType,

          correlationId:
            event.correlationId,
        };

        try {
          if (
            hasSharedIdempotency
          ) {
            const alreadyProcessed =
              await idempotency
                .isProcessed(
                  event.eventId,
                  event,
                );

            if (
              alreadyProcessed
            ) {
              logger.info(
                'RabbitMQ duplicate event skipped',
                logContext,
              );

              channel.ack(
                message,
              );

              return;
            }
          }

          await handler(
            event,
            {
              routingKey,

              fields:
                message.fields,

              properties:
                message.properties,
            },
          );

          if (
            hasSharedIdempotency
          ) {
            await idempotency
              .markProcessed(
                event.eventId,
                event,
              );
          }

          channel.ack(
            message,
          );

          logger.info(
            'RabbitMQ event consumed',
            logContext,
          );
        } catch (error) {
          logger.error(
            'RabbitMQ event handler failed',
            {
              ...logContext,

              requeue:
                requeueOnError,

              error,
            },
          );

          channel.nack(
            message,
            false,
            requeueOnError,
          );
        }
      },

      {
        ...consumerOptions,

        /*
         * Never use auto-ack for
         * CAB business events.
         */
        noAck: false,
      },
    );

  logger.info(
    'RabbitMQ consumer started',
    {
      queue:
        assertedQueue.queue,

      routingKeys:
        bindings,

      consumerTag:
        result.consumerTag,
    },
  );

  return {
    channel,

    queue:
      assertedQueue.queue,

    consumerTag:
      result.consumerTag,

    async close() {
      try {
        await channel.cancel(
          result.consumerTag,
        );
      } finally {
        await channel.close();
      }
    },
  };
}

module.exports = {
  consumeEvents,
};