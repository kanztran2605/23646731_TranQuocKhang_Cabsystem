#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for service in auth customer driver booking trip payment notification review api-gateway; do
  if [ "$service" = api-gateway ]; then directory=services/api-gateway; else directory="services/$service-service"; fi
  printf '\nTesting %s\n' "$directory"
  (cd "$directory" && npm test)
done
printf '\nTesting shared infrastructure\n'
node --test shared/tests/*.test.js
