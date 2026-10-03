# Redis

Redis belongs only to API Gateway infrastructure.

## Current responsibilities

- Rate-limit state.
- Optional short-lived token/cache/revocation state.
- Not a domain database.
- Must not store Booking, Driver, Trip, Payment, Review or Notification source-of-truth data.

## Demo

Rate limit:

3 requests / 10 seconds

The request above the configured threshold returns HTTP 429.