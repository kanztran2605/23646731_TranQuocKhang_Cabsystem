#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose down -v
docker compose up -d postgres mongodb rabbitmq redis

echo "Infrastructure reset. PostgreSQL/Mongo init and seed run on fresh volumes."
