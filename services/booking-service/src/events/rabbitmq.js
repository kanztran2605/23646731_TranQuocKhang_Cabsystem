'use strict';

const {
  createChannel,
  closeConnection,
} = require(
  '../../../../shared/rabbitmq/connection'
);

const {
  closePublisher,
} = require(
  '../../../../shared/rabbitmq/publisher'
);

async function checkRabbitMq() {
  const channel =
    await createChannel();

  await channel.close();

  return true;
}

async function closeRabbitMq() {
  await closePublisher();
  await closeConnection();
}

module.exports = {
  checkRabbitMq,
  closeRabbitMq,
};