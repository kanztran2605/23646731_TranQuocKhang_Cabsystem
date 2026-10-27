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

Client gọi business API qua Gateway `http://localhost:8080/api`. Request giữ alias ngắn để gõ nhanh; JSON trả về dùng tên rõ nghĩa như `User ID`, `Customer ID`, `Driver ID`, `Latitude`. `/api/v1` vẫn hỗ trợ client cũ với response alias ngắn. Xem ví dụ Postman trong `docs/api/README.md`.

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

### Windows 11 / Git Bash

Cần Git for Windows (Git Bash), Docker Desktop chạy Linux containers và Postman. Nếu chạy test ngoài Docker, cần Node.js 20+ với npm; Python 3 dùng cho helper migration/smoke. Mở **Git Bash Here** tại thư mục repository và kiểm tra:

```bash
git --version
docker version
docker compose version
```

**Máy mới / volume mới:** tạo cấu hình local nếu chưa có; không ghi đè `.env` đã tồn tại. Thay các placeholder mật khẩu/JWT bằng giá trị riêng trong `.env`, không đưa file này lên Git. Khóa AES mẫu và tài khoản seed chỉ dành cho dữ liệu demo giả; không dùng khóa công khai đó cho giấy phép/dữ liệu thật.

```bash
[ -f .env ] || cp .env.example .env
docker compose config --quiet
docker compose config --services
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
```

`config --quiet` kiểm tra cấu hình mà không in ENV đã resolve (có thể chứa secret). Đợi `/api/ready` trả 200 trước khi demo; gRPC và consumer có thể chưa sẵn sàng ngay khi process vừa khởi động.

**Máy demo đang dùng volume cũ:** giữ nguyên `.env`, volumes và `docker-compose.override.yml` local đang ghim RabbitMQ node hiện hữu. Không sao chép hostname cũ sang máy mới và không dùng riêng `-f docker-compose.yml` với volume này. Đọc `infrastructure/rabbitmq/README.md` trước mọi recreate RabbitMQ. Init/seed chỉ chạy trên volume mới; không chạy lại trên database đã đăng ký dữ liệu. Migration Rubric đã áp dụng trên máy demo, không cần chạy lại mỗi lần mở Docker Desktop. Khi thật sự cần repair schema, kiểm tra quyền/schema trước; các helper `repair-local-postgres.py`, `repair-local-mongodb.py`, `migrate-demo-rubric.py` backup vào `.backups/` trước khi sửa tương thích. Không reset volume để chữa lỗi role/schema.

**Dừng/mở lại các container đã có** (chỉ khi cần, không phải bước nghiệm thu bắt buộc):

```bash
docker compose stop
docker compose start --wait --wait-timeout 180
docker compose ps
```

Các lệnh này giữ container và volume, không đổi node name. Không dùng `down -v` hoặc prune volumes. Sau khi mở lại Docker Desktop, kiểm tra health và bốn queue RabbitMQ có consumer trước khi demo. Nếu chỉ RabbitMQ bị restart riêng, consumer hiện chưa tự đăng ký lại khi channel đóng; sau khi broker healthy cần restart các app liên quan trong một lần bảo trì chủ động:

```bash
docker compose restart driver-service booking-service trip-service payment-service notification-service
docker compose ps
```

Không chạy lệnh restart khi stack đang PASS mà không có nhu cầu. Đây là hướng dẫn phục hồi; milestone nghiệm thu không tự thực hiện restart/recreate.

Gateway:

```text
http://localhost:8080
```

RabbitMQ Management:

```text
http://localhost:15672
```

Health smoke:

```bash
curl -fsS http://localhost:8080/api/health
curl -fsS http://localhost:8080/api/ready
curl -fsS http://localhost:8080/api/health/services
```

Only Gateway exposes a business HTTP port to the host. Business services remain inside the Docker network.

Run `npm ci` at the root and install each service's declared dependencies before local tests. `npm test` runs all nine service suites and shared tests. Real DB integration suites are explicit `tests/database.integration.js` files. `scripts/smoke-local-full.py` verifies the full stack and the 30-item rubric through the Gateway. Its default payment key is P1; preserved P1 records can be replayed, and a repeat full smoke uses `--idempotency-key` with a fresh key. Current results are recorded in `docs/test/FINAL_IMPLEMENTATION_VALIDATION.md`.

Cài dependency và chạy unit/gRPC trong Git Bash (không migration/reset DB):

```bash
(
  set -e
  npm ci
  for service in auth customer driver booking trip payment notification review api-gateway; do
    directory="services/$service-service"
    [ "$service" = api-gateway ] && directory="services/api-gateway"
    (cd "$directory" && npm ci)
  done
  npm test
)
```

DB integration và full E2E là kiểm thử riêng có ghi fixture. Máy đã nghiệm thu không cần chạy lại để mở demo. Khi cần chạy lại E2E, dùng key mới vì P1 đã thuộc Payment có trước:

```bash
python scripts/smoke-local-full.py --idempotency-key "SMOKE-$(date +%Y%m%d%H%M%S)"
```

Kết quả mới nhất: `docs/test/RUBRIC_DEMO_VALIDATION.md`; rà soát nộp bài: `docs/test/FINAL_SUBMISSION_READINESS.md`. Không gửi `.backups/`, `.env` hoặc log chứa token kèm bài nộp.

### Demo Postman ngắn theo phiếu chấm

Base URL: `http://localhost:8080/api`. Body giữ tên viết tắt; response dùng nhãn đầy đủ như `User ID`, `Phone`, `Driver`.

- Customer: `POST /register` với `{"email":"demo@c.com","pw":"123","name":"Demo","phone":"0901234567"}`. Có thể bỏ `phone`; không cần OTP Customer.
- Driver: `POST /drivers/otp` với `{"phone":"0901234567"}`, sau đó `POST /drivers/register` với `{"phone":"0901234567","email":"driver.demo@example.com","pw":"123","otp":"123","name":"Driver Demo","plate":"59A12345"}`. OTP gắn phone, hạn 300 giây. Driver mới PENDING_APPROVAL/OFFLINE; Admin duyệt rồi Driver cập nhật vị trí và Online.
- Booking: `POST /bookings` với `{"p":{"lat":10.76,"lng":106.68},"d":{"lat":10.77,"lng":106.69}}` mặc định BIKE. Thêm `"vt":"CAR"` khi cần CAR; loại khác bị từ chối. Không có tọa độ mặc định.
- Nearby (Admin): `GET /drivers/nearby?lat=10.76&lng=106.68`, mặc định r=1/page=1/limit=5.
- Customer xem Driver được gán: `GET /trips/by-booking/{bid}` hoặc `/trips/{tid}` với token sở hữu Trip; có tên/mã Driver, loại xe và biển số.
- Pay: `POST /payments/{pid}/pay`, header `Idempotency-Key: P1`, có thể bỏ body. Callback: `POST /payments/{pid}/callback`, body `{"s":"COMPLETED"}`. Callback trước Pay bị từ chối. Replay Pay trả response Pay đầu tiên; xem trạng thái mới nhất bằng GET Payment.

Volume cũ: chạy `python scripts/migrate-demo-rubric.py` để kiểm tra, rồi `python scripts/migrate-demo-rubric.py --apply` để backup và bổ sung schema. Nếu bảng/schema cũ thuộc superuser khác, dùng `--backup-user <superuser> --schema-user <chủ-bảng>` sau khi xác minh. Không chạy lại init/seed trên volume cũ. Chạy `python scripts/ensure-bike-demo.py` sau cập nhật image để đảm bảo có BIKE demo riêng; không chuyển Driver CAR sang BIKE.

### Demo từ Postman trắng, không Collection/Environment

Tạo từng request bằng **New → HTTP Request**. Chọn Body → raw → JSON; với request cần quyền, chọn Authorization → Bearer Token rồi dán giá trị `Token` nhận từ login. Không ghi token vào source/README. Đăng nhập Customer/Admin bằng tài khoản demo ở mục 8; với Booking mặc định BIKE, dùng Driver demo `bike@cab.demo / 123` (fresh seed hoặc helper tạo riêng), không nhầm với Driver CAR `d@d.com`. Các tài khoản này chỉ phục vụ demo. Nếu đăng ký mới, dùng phone/email/plate chưa tồn tại.

Lấy ID từ response thật vì ID trên volume cũ có thể khác seed. Trong bảng sau, thay `{bid}`, `{oid}`, `{tid}`, `{pid}` bằng ID vừa nhận; tất cả path bắt đầu bằng `http://localhost:8080/api`.

| Bước | Method / path | Token / body |
| --- | --- | --- |
| Đăng nhập | POST `/login` | `{"email":"c@c.com","pw":"123"}`; lưu Token, Customer ID. Đổi email khi login Driver/Admin |
| Đặt xe | POST `/bookings` | Customer; dùng body p/d ở trên, bỏ vt cho BIKE; ghi Booking ID / Offer ID |
| Payment ban đầu | GET `/payments/by-booking/{bid}` | Customer; amount 50000, PENDING, eligible=false, Trip ID null |
| Thông báo / Offer | GET `/notifications`, GET `/drivers/me/offers` | Driver BIKE |
| Nhận chuyến | POST `/offers/{oid}/accept` | Driver BIKE; không cần body |
| Xem Trip và tài xế | GET `/trips/by-booking/{bid}` | Customer; ghi Trip ID, kiểm tra Driver trong response |
| Đến điểm đón | PATCH `/trips/{tid}/status` | Driver; `{"s":"ARRIVED"}` |
| Bắt đầu | PATCH `/trips/{tid}/status` | Driver; `{"s":"IN_PROGRESS"}` |
| Tọa độ di chuyển | PATCH `/trips/{tid}/location` | Driver; `{"lat":10.765,"lng":106.685}` |
| Hoàn thành | PATCH `/trips/{tid}/status` | Driver; `{"s":"COMPLETED"}` |
| Đọc Payment đã có | GET `/payments/by-booking/{bid}` | Customer; cùng Payment ID, có Trip ID, eligible=true |
| Pay | POST `/payments/{pid}/pay` | Customer; header Idempotency-Key riêng, ví dụ P2 nếu P1 đã dùng; không cần body |
| Callback mock | POST `/payments/{pid}/callback` | Customer; `{"s":"COMPLETED"}` |
| Kết quả / replay | GET `/payments/{pid}`, GET `/trips/{tid}`; gửi lại Pay cùng key | Payment COMPLETED / Trip paid=true; replay Pay trả snapshot PENDING ban đầu |
| Đánh giá | POST `/trips/{tid}/reviews` | Customer; `{"star":5,"c":"ok"}`; gửi trùng nhận 409 |

Event bất đồng bộ có thể cần một khoảng ngắn để consumer lưu projection; nếu chưa có Trip/Payment/Notification, đọc lại GET, không tạo Booking/Payment thứ hai để thay thế. P1 chỉ replay đúng Payment đã gắn key đó, không tái dùng cho Payment mới.

## 10. Definition of Done

A feature is DONE only when:

1. It matches SRS + DDD + API/proto/event contracts.
2. It does not read/write another service's DB.
3. Related automated/integration tests pass.
4. Related Test Case rows pass.
5. The matching rubric smoke is deterministic and practical within ~30 seconds.

Do not commit a milestone while its tests are failing.
