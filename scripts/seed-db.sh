#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  < infrastructure/postgres/seed.sql

echo "PostgreSQL deterministic seed applied."
