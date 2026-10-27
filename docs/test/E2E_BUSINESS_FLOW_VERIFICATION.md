# E2E Business Flow Verification — 2026-10-27

Result: **PASS — 31/31 E2E checks, 30/30 rubric criteria, all eight canonical event types redelivered safely.**

The existing `scripts/smoke-local-full.py` ran against the real 13-component stack.
All business requests used Gateway `http://localhost:8080/api`, with short request
aliases and the documented readable response labels. SQL/Mongo queries were
read-only verification from the test harness. No service, API, proto, event,
architecture, schema or volume change was made in this milestone.

Sources reviewed: current SRS, DDD.docx, REST contracts, proto contracts,
AsyncAPI and contracts/events. Domain gRPC edges remain Booking → Customer,
Booking → Driver, Trip → Driver and Review → Trip. Exactly the eight existing
RabbitMQ routing keys are used.

## Step results

| Step | Result | Real-stack evidence |
| --- | --- | --- |
| Startup/readiness | PASS | 13 healthy components; Gateway health/ready/service checks HTTP 200, eight services healthy |
| Canonical demo login | PASS | Customer, Driver and Admin authenticated; same Admin Driver detail endpoint rejected Customer with 403 |
| New Customer registration/login | PASS | Disposable User 34 / Customer 15; Auth account and owned CustomerProfile persisted |
| New Driver onboarding/approval | PASS | Drivers 40/41, Users 35/36; OTP 123, PENDING_APPROVAL → APPROVED; availability/location checked |
| Matching/Offer | PASS | Booking 35 selected nearest eligible Driver 40; exactly one Offer 31 |
| Early Payment | PASS | booking.created created Payment 21 immediately: 50000/PENDING/ineligible/no Trip/key |
| Driver acceptance | PASS | Driver became BUSY; one accepted Offer/Assignment; driver.accepted created one ASSIGNED unpaid Trip 2744208 |
| Duplicate acceptance | PASS | Same result; no second Assignment/event or initial Trip history |
| Trip lifecycle/location | PASS | ASSIGNED → ARRIVED → IN_PROGRESS → location update → COMPLETED; four history rows, one location; paid remained false |
| Payment eligibility | PASS | trip.completed attached Trip 2744208 to existing Payment 21; eligible=true, still PENDING; Driver released |
| Pay/callback/replay | PASS | Payment 21 COMPLETED; Trip paid=true; replay returned the same result, with one producer completion event |
| Review | PASS | Review 14, Customer 15 / Driver 40 / Trip 2744208, star=5, c=ok; duplicate returned 409 |
| Cancellation | PASS | Separate Trip 2744210 CANCELED with reason x; Driver released; two recipient documents, replay deduplicated |
| Security | PASS | Wrong ownership/invalid transition rejected; SQLi did not bypass login; missing/tampered JWT 401; XSS sanitized; Redis 200/200/200/429 |

Fresh idempotency key: `E2E-20261027-e3e73612`. The preserved demo key P1 was not
reassigned or cleared. A repeat E2E run must use a new key because prior test
Payments and their source records are intentionally retained.

## Same Payment throughout the flow

| Stage | pid | bid | tid | amt | status | eligible |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| After booking.created | 21 | 35 | null | 50000 | PENDING | false |
| After trip.completed | 21 | 35 | 2744208 | 50000 | PENDING | true |
| After mock callback | 21 | 35 | 2744208 | 50000 | COMPLETED | true |

Payment count for Booking 35 remained one. Repeated pay and callback returned the
same Payment/result and emitted no second payment.completed. Afterwards the
original payment.completed envelope was deliberately redelivered to verify Trip
and Notification consumer idempotency; this controlled test delivery is distinct
from an additional producer completion.

## RabbitMQ publishing, consumption and replay

The test observed real publications through a temporary observer queue, retaining
the original event IDs, types, timestamps and correlation. It never consumed or
purged canonical service queues. Redelivery was followed by direct broker checks
for acknowledged/empty canonical queues before checking persisted effects.

| Original event redelivered | Verified effect |
| --- | --- |
| booking.created | Same Payment ID and initial state; one Payment per Booking |
| offer.created | One Notification for the receiving Driver UID |
| driver.accepted | One Trip per Booking and one initial history row |
| driver.approval.changed | One approval Notification per source event/Driver UID |
| trip.status.changed | One Customer Notification; no additional Trip transition/history |
| trip.canceled | Exactly two Notifications for Customer/Driver; Driver AVAILABLE |
| trip.completed | Same existing Payment/trip link/eligibility; no duplicate Payment |
| payment.completed | Trip remains paid; unchanged Payment; one Customer Notification |

MongoDB independently verified 17 new documents, all unique by `(eid, uid)`:
three Offer, two approval, nine normal Trip status, two cancellation and one
Payment notification. No Notification was created for booking.created,
driver.accepted or trip.completed. Recipient UIDs matched the disposable users.

## Database verification and preservation

Independent SQL reads verified Booking/Offer/Assignment identity links in
booking_db, Customer/Driver ownership, matching Trip and Payment references in
their owned databases, and the canonical Review `star`/`cmt` storage fields.
Notification persisted in MongoDB notification_db.

Before/after content-hash comparisons confirmed every pre-existing row in 25
inspected PostgreSQL business tables and all 40 prior Mongo Notification
documents remained unchanged. Hash evidence is private; it is not a database
backup. No reset, migration, deletion of business records, container recreation
or volume operation was performed.

Retained disposable records: Customer 15, Drivers 40/41, Bookings 35–39, main Trip
2744208, cancellation Trip 2744210 and XSS Trip 2744211. Both test Drivers finished
OFFLINE. The two extra NO_DRIVER_FOUND Bookings supply the new Customer's history
fixture without modifying seeded Customer data. The temporary observer queue was
removed; canonical queues and all event-source records remain.

## Minimal test-script corrections

- Read current health `status: HEALTHY` instead of obsolete `s: UP`.
- Obtain the PostgreSQL username from Compose instead of hardcoding cab_user;
  the inspected current runtime uses cab.
- Add `/api` response decoding/label assertions, preserving an optional `/api/v1`
  test mode and all short request fields.
- Use an isolated new Customer and an empty valid pickup area; only this run's
  Drivers may be set OFFLINE during cleanup.
- Extend the existing smoke with explicit original-event redelivery assertions
  for all eight types and token-free Payment/Review evidence.

No application business defect was found. This milestone changes only the
existing smoke script and this report; earlier working-tree changes are retained.

## Reproduction and private evidence

PowerShell, with Python 3 available and the canonical stack already running:

```powershell
$key = "E2E-" + [guid]::NewGuid().ToString("N")
python scripts/smoke-local-full.py --api-prefix /api --idempotency-key $key
docker compose config --quiet
docker compose ps
git diff --check
```

Private evidence is ignored under `.backups/`:

- `e2e-business-E2E-20261027-e3e73612.log`
- `full-smoke-7214b78bc62b.json`
- `e2e-business-cross-db-verification.json`
- `e2e-business-existing-data-before.json`

The E2E process exited 0. Python syntax, Compose configuration and git diff checks
passed. No remaining business-flow blocker was identified.
