# Booking Service

Owns `booking_db` and the current `booking`, `driver_offer`, `driver_assignment`
tables. Business requests enter through Gateway REST `/api/v1`; the service
implements the five RPCs in `proto/booking.proto` and `HealthService.Check`.

Creation validates the authenticated Customer through Customer gRPC, saves a
`SEARCHING` Booking, confirms `booking.created`, and queries Driver gRPC using
`BOOKING_MATCH_RADIUS_KM=1`, `BOOKING_MATCH_CANDIDATE_LIMIT=20`, and a string
vehicle category such as `CAR`. Driver owns eligibility filtering. Booking
selects the nearest candidate and commits one Offer before `offer.created`.
An empty eligible result persists `NO_DRIVER_FOUND` without an Offer or
Assignment. A failed lookup returns a service error rather than a false empty
matching result.

Acceptance locks the Booking/Offer, checks ownership and current state, calls
`Driver.MarkBusyForAssignment`, and commits Offer acceptance, Assignment and
`ASSIGNED` Booking before confirming `driver.accepted`. Repeating an accepted
Offer returns the same response without another Driver transition, Assignment
or event. Only Customer and Driver gRPC clients are registered.

PostgreSQL row locks and unique constraints protect local concurrency. Driver
reservation and the local commit are separate service transactions. A database
failure after a successful reservation can leave the Driver BUSY; a broker
failure after commit can leave a persisted record without its event. These
failures return an error and need local inspection. This MVP does not provide
automatic recovery or a distributed transaction. An accepted replay does not
republish an event.

## Verification

```text
cd services/booking-service
npm install --package-lock=false
npm test
```

`tests/database.integration.js` additionally exercises the real owned database,
unique constraints, concurrent acceptance locks and rollback. It requires the
normal service ENV, creates its own records and removes only those records.

For an inspected older local volume, `scripts/repair-local-postgres.py
--superuser <existing-superuser> --booking-only` backs up the cluster, preserves
the original Booking tables in verified archives, and copies compatible rows
into the current schema. It never resets a volume or changes unrelated schemas.

`scripts/smoke-local-booking.py` runs business requests through `localhost:8080`,
honors the real Redis rate limit, and verifies copies of the three events using
a temporary RabbitMQ observer queue. It retains source records for queued
Payment/Trip events and returns the unused disposable Driver OFFLINE. Use
`scripts/smoke-local-full.py` for final full-stack validation, including all eight
service health checks, Trip, Payment, Notification and Review.
