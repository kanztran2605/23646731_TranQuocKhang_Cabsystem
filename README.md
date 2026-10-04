# CAB System — MVP / Demo Microservice Architecture

> Môn học: Lập Trình Hướng Dịch Vụ
> Project goal: **demo đúng 30/30 rubric, deterministic, mỗi mục thao tác mục tiêu ≤ 30 giây**.

## 1. Scope chính thức

CAB System là hệ thống đặt xe demo theo Microservice Architecture. Đây **không phải production system**; chỉ triển khai những gì truy được về core flow hoặc phiếu chấm.

Runtime chính thức:

- `api-gateway`
- `auth-service`
- `customer-service`
- `driver-service`
- `booking-service`
- `trip-service`
- `payment-service`
- `notification-service`
- `review-service`
- PostgreSQL + PostGIS
- MongoDB
- Redis
- RabbitMQ

**Không có** `report-service`, `audit-service`, Fare/Pricing Engine hoặc external provider thật.

## 2. Source of Truth

Khi code hoặc tài liệu mâu thuẫn, **không lấy code cũ làm chuẩn**. Dùng thứ tự theo loại quyết định trong `AI_CONTEXT.md`.

Các tài liệu hiện hành:

- Requirement: `docs/requirements/SRS.md`
- Domain model: `docs/architecture/DDD.docx`
- Final diagrams: `docs/architecture/`
- Public REST: `docs/api/*.yaml`
- Async events: `docs/api/asyncapi.yaml` + `contracts/events/`
- gRPC: `proto/`
- Tests: `docs/test/CAB System Test Cases.xlsx`

Mọi implementation cũ trái với các nguồn trên là **legacy cần refactor**, không phải requirement.

## 3. Architecture khóa

```text
Client
  │ REST/JSON
  ▼
API Gateway  <->  Redis
  │ gRPC
  ├─ Auth
  ├─ Customer
  ├─ Driver
  ├─ Booking
  ├─ Trip
  ├─ Payment
  ├─ Notification
  └─ Review

Async business events -> RabbitMQ exchange cab.events
```

Client chỉ gọi business API qua Gateway `http://localhost:8080/api/v1`.

### Service-to-service gRPC

Chỉ giữ 4 caller chính:

```text
Booking -> Customer : validate/get Customer
Booking -> Driver   : nearby/matching + Driver state
Trip    -> Driver   : Driver/location data
Review  -> Trip     : validate COMPLETED + ownership
```

Không tự thêm cặp gRPC khác nếu SRS chưa thay đổi.

## 4. RabbitMQ contract

Exchange:

```text
cab.events
```

Type:

```text
topic
```

8 routing key chính thức:

```text
booking.created
offer.created
driver.accepted
driver.approval.changed
trip.status.changed
trip.canceled
trip.completed
payment.completed
```

Không dùng lại các event legacy như:

```text
driver.offer.created
booking.no_driver_found
payment.failed
review.created
```

## 5. Payment lifecycle khóa

Payment **không được tạo sau Trip completed**.

```text
Create Booking
  -> booking.created
  -> payment-service creates exactly one Payment
     status=PENDING
     amount=50000
     eligible=false
     tripId=NULL

Trip COMPLETED
  -> trip.completed
  -> find existing Payment by bookingId
  -> attach tripId
  -> eligible=true

Pay existing Payment with Idempotency-Key=P1
  -> mock callback
  -> COMPLETED
  -> payment.completed
```

Rules:

- `Payment.bookingId` UNIQUE.
- Duplicate `booking.created` must not create a second Payment.
- `trip.completed` only updates the existing Payment; it never creates one.
- Callback can complete only `PENDING + eligible=true`.
- Replay with the same idempotency key returns the same Payment and never double charges.

## 6. Booking / Driver / Trip simplification

Booking matching MVP:

```text
Create Booking
  -> validate Customer
  -> publish booking.created
  -> find nearest eligible Driver
  -> create ONE Offer
```

Eligible Driver:

```text
APPROVED + AVAILABLE + matching vehicle type
```

If none exists:

```text
Booking.status = NO_DRIVER_FOUND
```

No timeout scheduler, reject loop, expiration workflow or automatic retry orchestration.

Trip state machine:

```text
ASSIGNED -> ARRIVED -> IN_PROGRESS -> COMPLETED
```

Alternative terminal state:

```text
CANCELED
```

Smoke #17 must include at least one Trip location update while `IN_PROGRESS`.

## 7. Databases

One PostgreSQL container hosts **7 logical databases**:

```text
auth_db
customer_db
driver_db      (+ PostGIS)
booking_db
trip_db
payment_db
review_db
```

Notification owns MongoDB:

```text
notification_db
```

Redis belongs only to Gateway infrastructure. It is not a business database.

No physical FK across service-owned databases. Cross-context IDs are logical references.

## 8. Demo values

```text
Customer : c@c.com / 123
Driver   : d@d.com / 123
Admin    : a@a.com / 123
OTP      : 123
amount   : 50000
idem key : P1
reason   : x
star     : 5
comment  : ok
radius   : 1 km
rate     : 3 requests / 10 seconds
```

Public REST/demo aliases may be short (`uid`, `cid`, `did`, `bid`, `tid`, `pid`, `pw`, `s`, `lat`, `lng`, `amt`).
**Proto, event contracts, domain code and internal names use descriptive field names** (`user_id`, `booking_id`, `customerId`, `tripId`, ...).

## 9. Local runtime

For a fresh checkout, create the local configuration only if `.env` does not already exist. The example credentials and encryption key are for local development/demo only.

```bash
[ -f .env ] || cp .env.example .env
docker compose up -d --build
docker compose ps
```

Existing volumes must be preserved. Initialization scripts run only on fresh volumes. For an older local cluster, inspect its current schema and existing superuser first; `scripts/repair-local-postgres.py` and `scripts/repair-local-mongodb.py` create private backups under `.backups/` before applying compatible local repairs. Supply the PostgreSQL runtime credentials through ENV and the inspected superuser through `--superuser`; use `--booking-only` or `--remaining-only` for the corresponding schema. Do not reset volumes to fix a missing role or schema.

Gateway:

```text
http://localhost:8080
```

RabbitMQ Management:

```text
http://localhost:15672
```

Health smoke:

```text
GET /api/v1/health
GET /api/v1/ready
GET /api/v1/health/services
```

Only Gateway exposes a business HTTP port to the host. Business services remain inside the Docker network.

Run `npm ci` at the root and install each service's declared dependencies before local tests. `npm test` runs all nine service suites and shared tests. Real DB integration suites are explicit `tests/database.integration.js` files. `scripts/smoke-local-full.py` verifies the full stack and the 30-item rubric through the Gateway. Its default payment key is P1; preserved P1 records can be replayed, and a repeat full smoke uses `--idempotency-key` with a fresh key. Current results are recorded in `docs/test/FINAL_IMPLEMENTATION_VALIDATION.md`.

## 10. Definition of Done

A feature is DONE only when:

1. It matches SRS + DDD + API/proto/event contracts.
2. It does not read/write another service's DB.
3. Related automated/integration tests pass.
4. Related Test Case rows pass.
5. The matching rubric smoke is deterministic and practical within ~30 seconds.

Do not commit a milestone while its tests are failing.
