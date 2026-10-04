#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -ne 1 || "$1" != "--confirm-delete-local-data" ]]; then
  echo "Refusing to reset preserved data. This deletes PostgreSQL, MongoDB, Redis and RabbitMQ volumes."
  echo "Use local repair helpers for existing data. A deliberate disposable reset requires --confirm-delete-local-data."
  exit 1
fi

docker compose down -v
docker compose up -d postgres mongodb rabbitmq redis

echo "Infrastructure reset. PostgreSQL/Mongo init and seed run on fresh volumes."
