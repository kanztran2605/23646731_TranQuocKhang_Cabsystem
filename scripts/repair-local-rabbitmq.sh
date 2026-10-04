#!/bin/sh
# LOCAL DEVELOPMENT ONLY. Run inside the inspected RabbitMQ container after
# exporting its definitions to a private local backup. No queues/data are deleted.
set -eu
: "${RABBITMQ_DEFAULT_USER:?Runtime RabbitMQ username is required}"
: "${RABBITMQ_DEFAULT_PASS:?Runtime RabbitMQ password is required}"

if rabbitmqctl list_users --no-table-headers | cut -f1 | grep -Fx -- "$RABBITMQ_DEFAULT_USER" >/dev/null; then
  rabbitmqctl change_password "$RABBITMQ_DEFAULT_USER" "$RABBITMQ_DEFAULT_PASS" >/dev/null
else
  rabbitmqctl add_user "$RABBITMQ_DEFAULT_USER" "$RABBITMQ_DEFAULT_PASS" >/dev/null
fi
rabbitmqctl set_permissions -p / "$RABBITMQ_DEFAULT_USER" '.*' '.*' '.*' >/dev/null
rabbitmqctl set_user_tags "$RABBITMQ_DEFAULT_USER" administrator >/dev/null
rabbitmqctl authenticate_user "$RABBITMQ_DEFAULT_USER" "$RABBITMQ_DEFAULT_PASS" >/dev/null
printf 'PASS RabbitMQ runtime account and permissions: %s\n' "$RABBITMQ_DEFAULT_USER"
