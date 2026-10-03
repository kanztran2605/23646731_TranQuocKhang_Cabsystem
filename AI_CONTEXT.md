# CAB System — AI / Codex Project Context

## 0. Mandatory instruction

This file is the **first context file for Codex/AI**.

The repository contains legacy implementation from an older 10-service design. **Never infer requirements from old code, Git history, deleted files or stale comments when they conflict with the sources below.** Refactor legacy code to the current design; do not resurrect removed features.

If a conflict cannot be resolved by the rules below, STOP and report the conflict instead of inventing a new business rule.

---

## 1. Current project objective

Build a deterministic **MVP / Demo MSA** for classroom evaluation:

- cover all 30 rubric items;
- target ≤30 seconds of manual demo per rubric item;
- prefer simple, local, deterministic flows;
- no real external provider/API key dependency;
- no production-grade feature unless the SRS/rubric requires it.

---

## 2. Source-of-truth rules

### 2.1 Requirement / scope

1. `docs/requirements/SRS.md`
2. `docs/requirements/Customer Requirement.docx`

SRS is the current MVP interpretation. Do not re-expand production requirements that SRS intentionally simplified.

### 2.2 Domain model / invariants

1. `docs/architecture/DDD.docx`
2. `docs/requirements/SRS.md`

Use for Bounded Context, Aggregate, state machine, ownership and business rules.

### 2.3 Public REST API

1. `docs/api/*.yaml`
2. SRS / DDD

REST exists only at the API Gateway boundary.

### 2.4 gRPC

1. `proto/`
2. SRS / DDD topology

Proto is the executable synchronous contract after this refactor.

### 2.5 Events

1. `docs/api/asyncapi.yaml`
2. `contracts/events/`
3. DDD event table
4. SRS ARC05

All four must describe the same 8 routing keys.

### 2.6 Data model

1. Final ERD image in `docs/architecture/ERD.png`
2. DDD
3. SRS data model
4. `infrastructure/postgres/init.sql` / Mongo init after refactor

Cross-service IDs are logical references; no physical FK across databases.

### 2.7 Tests / acceptance

1. `docs/test/CAB System Test Cases.xlsx`
2. SRS Acceptance Criteria
3. DDD invariants

A feature is not DONE until its related tests pass.

### 2.8 Existing source code

Use existing code only when it does not conflict with the sources above. Old implementation is reusable material, not authority.

---

## 3. Locked runtime scope

Exactly **8 business services + API Gateway**:

1. `auth-service`
2. `customer-service`
3. `driver-service`
4. `booking-service`
5. `trip-service`
6. `payment-service`
7. `notification-service`
8. `review-service`
9. `api-gateway` as platform entry point

Infrastructure:

- PostgreSQL 16 + PostGIS, one container, 7 logical DBs
- MongoDB for `notification_db`
- Redis for Gateway infrastructure only
- RabbitMQ exchange `cab.events`
- Docker Compose

Forbidden / removed:

- `report-service`
- `audit-service`
- Pricing/Fare service or Fare aggregate
- PaymentTransaction/provider orchestration
- real Map/Payment/SMS/Email/Push providers

Do not recreate them.

---

## 4. Database ownership

```text
auth-service         -> auth_db
customer-service     -> customer_db
driver-service       -> driver_db (PostGIS enabled)
booking-service      -> booking_db
trip-service         -> trip_db
payment-service      -> payment_db
notification-service -> notification_db (MongoDB)
review-service       -> review_db
```

Rules:

- a service directly reads/writes only its owned DB;
- no cross-database physical FK;
- cross-context validation/query uses the locked gRPC link;
- async projections/side effects use RabbitMQ events;
- Redis never stores Booking/Trip/Payment source-of-truth state.

---

## 5. Communication topology

### 5.1 External

```text
Client --REST/JSON--> API Gateway
```

Client never calls a business service directly.

### 5.2 Gateway -> business service

Gateway calls all 8 business services using gRPC.

### 5.3 Service-to-service gRPC

Only these caller directions are allowed unless SRS is changed:

```text
Booking -> Customer : validate/get Customer
Booking -> Driver   : nearby/matching + current Driver state
Trip    -> Driver   : Driver/location data
Review  -> Trip     : validate COMPLETED + ownership + Driver
```

Do not add Booking->Trip, Trip->Payment, Payment->Trip, Auth->Customer or other synchronous pairs.

---

## 6. RabbitMQ contract

Exchange:

```text
cab.events
```

Type:

```text
topic
```

Canonical events:

| Event | Producer | Consumer(s) |
|---|---|---|
| `booking.created` | booking-service | payment-service |
| `offer.created` | booking-service | notification-service |
| `driver.accepted` | booking-service | trip-service |
| `driver.approval.changed` | driver-service | notification-service |
| `trip.status.changed` | trip-service | notification-service |
| `trip.canceled` | trip-service | driver-service, notification-service |
| `trip.completed` | trip-service | driver-service, payment-service |
| `payment.completed` | payment-service | trip-service, notification-service |

Legacy event names are forbidden:

```text
driver.offer.created
booking.no_driver_found
payment.failed
review.created
```

Common event envelope is intentionally small:

```json
{
  "eventId": "uuid",
  "eventType": "booking.created",
  "occurredAt": "ISO-8601",
  "payload": {}
}
```

Consumers must be idempotent. Event payload field names are descriptive internal names, not REST demo aliases.

---

## 7. Payment lifecycle — critical rule

This rule must never regress.

### 7.1 Booking creation

```text
Booking persisted
 -> publish booking.created
 -> payment-service creates exactly one Payment
    bookingId = event.bookingId
    tripId = NULL
    amount = 50000
    eligible = false
    status = PENDING
```

`Payment.bookingId` is UNIQUE. Duplicate `booking.created` returns/keeps the existing Payment.

### 7.2 Trip completion

```text
Trip -> COMPLETED
 -> publish trip.completed with tripId + bookingId
 -> payment-service finds existing Payment by bookingId
 -> attach tripId
 -> eligible = true
```

`trip.completed` must never create a second Payment.

### 7.3 Payment action

Customer/System pays the existing Payment using `Idempotency-Key`, demo value `P1`.

- require `status=PENDING`;
- require `eligible=true`;
- same key + same request => return same Payment;
- same key + conflicting request => conflict;
- mock callback completes the Payment;
- completed Payment publishes `payment.completed`;
- trip-service consumes it and sets `paid=true`.

No real payment provider and no sensitive card/account data.

---

## 8. Driver / Booking / Trip rules

### Driver

OTP mock:

```text
123
```

Approval:

```text
PENDING_APPROVAL | APPROVED | REJECTED
```

Availability:

```text
OFFLINE | AVAILABLE | BUSY
```

Matching eligibility:

```text
APPROVED + AVAILABLE + compatible vehicle type
```

Nearby smoke may display multiple states; matching must use only eligible drivers.

### Booking

MVP flow:

```text
persist Booking
 -> booking.created
 -> validate Customer
 -> find nearest eligible Driver
 -> create ONE Offer
 -> offer.created
```

If no eligible Driver:

```text
Booking.status = NO_DRIVER_FOUND
```

Do not implement offer TTL, expiration, rejection loop, matching retry scheduler or restart recovery orchestration.

### Offer accept

```text
OPEN -> ACCEPTED
 -> DriverAssignment
 -> Booking ASSIGNED
 -> driver.accepted
 -> Trip ASSIGNED
 -> Driver BUSY
```

### Trip

State machine:

```text
ASSIGNED -> ARRIVED -> IN_PROGRESS -> COMPLETED
```

Cancel is allowed only in valid pre-terminal states and requires a reason.

Smoke #17 requires at least one `lat/lng` update while `IN_PROGRESS` before `COMPLETED`.

Terminal:

```text
COMPLETED | CANCELED
```

No `PICKED_UP`, ETA or abnormal-trip workflow.

---

## 9. Notification / Review

### Notification

- MongoDB `notification_db`.
- Consume only the event bindings defined in AsyncAPI/RabbitMQ definitions.
- Persist local Notification document.
- Deduplicate by source `eventId`.
- No SMS/Email/Push provider.
- Notification failure must not roll back the source business transaction.

### Review

- only Customer owning a `COMPLETED` Trip;
- `Review -> Trip` gRPC validates completed/ownership/driver;
- score 1..5;
- one Review per Trip in MVP;
- comment must be handled safely for XSS smoke;
- Review publishes no event in current MVP.

---

## 10. Naming rule

Public REST/demo may use short aliases for fast typing:

```text
uid cid did vid bid oid tid pid rid
pw s lat lng vt amt r star c
```

Internal Proto/Event/Domain/Repository code should use descriptive names:

```text
user_id / userId
customer_id / customerId
driver_id / driverId
booking_id / bookingId
trip_id / tripId
payment_id / paymentId
```

Do not shorten internal contracts merely to save typing.

---

## 11. Demo values

```text
Customer: c@c.com / 123
Driver:   d@d.com / 123
Admin:    a@a.com / 123
OTP:      123
Payment amount: 50000
Idempotency-Key: P1
Cancel reason: x
Review: star=5, c=ok
Nearby radius: 1 km
Rate limit demo: 3 requests / 10 seconds
```

---

## 12. Implementation order for refactor

Do not implement randomly. Preferred milestones:

1. README + AI context
2. Proto + Event Contracts + AsyncAPI + RabbitMQ definitions
3. Docker Compose + `.env.example` + DB init/seed + Mongo init
4. shared infrastructure helpers
5. API Gateway
6. Auth / Customer / Driver / Booking refactor
7. Trip
8. Payment
9. Notification
10. Review
11. automated tests
12. 30-rubric smoke pack

At each milestone:

- run syntax/config tests;
- run related service/integration tests;
- compare to Test Cases;
- do not commit until passing.

---

## 13. Conflict handling

If code/docs disagree:

1. classify the conflict (requirement, domain, API, gRPC, event, data, test);
2. use the source-of-truth rule for that category;
3. refactor legacy code toward the current contract;
4. if two authoritative sources still conflict, STOP and report both sides to the user.

Never silently invent a ninth service, new event, new state, new provider or new cross-service DB access.
