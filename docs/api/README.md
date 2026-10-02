# CAB System – API Specifications (DDD FINAL)

## 1. Phạm vi

Bộ contract này đã được đồng bộ với **DDD FINAL**, ERD/Data Ownership, Bounded Context và kiến trúc Microservice cuối cùng của CAB System.

- Client → API Gateway: **REST API (HTTPS/JSON)**, mô tả bằng OpenAPI 3.0.3.
- API Gateway → internal service: **gRPC synchronous** theo kiến trúc cuối.
- Service ↔ Service synchronous chỉ dùng khi cần dữ liệu tức thời; contract cốt lõi nằm trong `grpc/`.
- Service ↔ Service asynchronous: **RabbitMQ topic exchange `cab.events`**, mô tả trong `asyncapi.yaml`.
- Tất cả request business từ client đi qua API Gateway.

Base URL demo:

```text
http://localhost:8080/api/v1
```

Health base URL:

```text
http://localhost:8080
```

## 2. 10 Bounded Context / 10 Microservice / 10 Database

| Bounded Context | Service | Owned DB |
|---|---|---|
| Identity & Access | `auth-service` | `auth_db` |
| Customer Management | `customer-service` | `customer_db` |
| Driver & Vehicle Management | `driver-service` | `driver_db` |
| Booking Management | `booking-service` | `booking_db` |
| Trip Management | `trip-service` | `trip_db` |
| Fare & Payment | `payment-service` | `payment_db` |
| Notification | `notification-service` | `notification_db` |
| Rating & Review | `review-service` | `review_db` |
| Reporting | `report-service` | `reporting_db` |
| Audit | `audit-service` | `audit_db` |

`operation-service` và `operation_db` **không còn tồn tại**. Chức năng cũ đã được chuyển về service sở hữu đúng domain.

### Database Ownership

Mỗi service chỉ trực tiếp đọc/ghi DB mình sở hữu. `userId`, `customerId`, `driverId`, `vehicleId`, `bookingId`, `tripId`, `fareId`, `paymentId` ở context khác chỉ là **logical reference**; không tạo physical FK xuyên database.

Local có thể dùng một PostgreSQL 16 instance với 10 logical DB/schema. `driver_db` khuyến nghị bật PostGIS cho Nearby Driver/Search Radius.

## 3. Trạng thái nghiệp vụ đã khóa

### Booking Status

```text
CREATED → SEARCHING → ASSIGNED
                  └→ NO_DRIVER_FOUND
```

`ASSIGNED` và `NO_DRIVER_FOUND` là terminal states của Booking trong MVP. Trip lifecycle thuộc Trip Management riêng.

### Trip State Machine

```text
ASSIGNED → ARRIVED → PICKED_UP → IN_PROGRESS → COMPLETED
```

`CANCELED` là terminal state hợp lệ. `Abnormal Trip` là nghiệp vụ vận hành, **không phải một Trip Status riêng**.

### Driver

Approval: `PENDING_APPROVAL | APPROVED | REJECTED`  
Availability: `OFFLINE | AVAILABLE | BUSY`

Driver chỉ tham gia Matching khi `APPROVED + AVAILABLE`.

### Fare

Fare chỉ được tạo khi Trip `COMPLETED`:

```text
Amount = max(MinimumFare, BaseFare + TripDistance × PerKmRate)
```

Pricing Policy Snapshot phải đủ dữ liệu để truy vết.

### Payment

Method: `CASH | ELECTRONIC`  
Status: `PENDING | COMPLETED | FAILED`

Idempotency-Key bắt buộc ở create/retry payment. Callback electronic payment phải được xác thực và không được double charge.

## 4. OpenAPI files

| File | Ownership / nội dung |
|---|---|
| `authentication.yaml` | Identity/Auth, Refresh Token, OTP, onboarding entry point |
| `authorization.yaml` | Role/Permission |
| `users.yaml` | Gateway profile composition + Customer Management |
| `drivers.yaml` | Driver Profile, approval, Availability, Location, Nearby Driver |
| `vehicles.yaml` | Vehicle / Vehicle Type related REST operations |
| `bookings.yaml` | Booking, Driver Offer, Driver Assignment |
| `trips.yaml` | Trip lifecycle, history, cancel, active/abnormal trip operations |
| `reviews.yaml` | Review owned by review-service |
| `fare.yaml` | Read Fare; Fare Calculation được event kích hoạt tự động |
| `payments.yaml` | Payment, callback, retry, transaction lookup |
| `notifications.yaml` | Notification read model/API |
| `reports.yaml` | Trip/Revenue/Driver Performance reports |
| `audit.yaml` | Audit Log |
| `health.yaml` | `/health`, `/ready`, `/health/services` cho 10 service |
| `asyncapi.yaml` | 9 RabbitMQ Domain/Integration Events |

`operations.yaml` đã được **xóa**. Mapping cũ:

- Driver approval → `drivers.yaml`
- Active/abnormal Trip → `trips.yaml`
- Transaction lookup → `payments.yaml`
- Reporting → `reports.yaml`
- Audit → `audit.yaml`

## 5. gRPC synchronous relationships

OpenAPI là public contract qua Gateway. Internal synchronous communication của kiến trúc cuối dùng gRPC.

Các quan hệ service-to-service chính:

| Caller | Callee | Mục đích |
|---|---|---|
| booking-service | customer-service | Validate/Get Customer |
| booking-service | driver-service | Driver Matching / Nearby Driver |
| trip-service | driver-service | Driver Location / ETA |
| review-service | trip-service | Validate Completed Trip |

Contract cốt lõi nằm trong `grpc/internal-service-contracts.proto`.

## 6. RabbitMQ events

Exchange:

```text
cab.events
```

Type:

```text
topic
```

9 routing keys chính thức:

```text
booking.created
driver.offer.created
booking.no_driver_found
driver.accepted
trip.status.changed
trip.canceled
payment.completed
payment.failed
review.created
```

| Event | Producer | Consumers |
|---|---|---|
| `booking.created` | booking-service | notification-service |
| `driver.offer.created` | booking-service | notification-service |
| `booking.no_driver_found` | booking-service | notification-service, audit-service |
| `driver.accepted` | booking-service | trip-service, driver-service, notification-service |
| `trip.status.changed` | trip-service | driver-service, notification-service, payment-service, report-service, audit-service |
| `trip.canceled` | trip-service | driver-service, notification-service, report-service, audit-service |
| `payment.completed` | payment-service | notification-service, report-service, audit-service |
| `payment.failed` | payment-service | notification-service, report-service, audit-service |
| `review.created` | review-service | report-service |

Mọi event dùng envelope:

```text
eventId
eventType
occurredAt
producer
correlationId
schemaVersion
payload
```

Consumer phải idempotent.

## 7. Các thay đổi quan trọng so với API cũ

1. `Booking & Dispatch` → **Booking Management**; không còn Dispatch table/aggregate.
2. Booking Status → `CREATED / SEARCHING / ASSIGNED / NO_DRIVER_FOUND`.
3. Accept/Reject thao tác trên `Driver Offer` bằng `offerId`; `driver.accepted` **không chứa tripId**.
4. `trip-service` độc lập và sở hữu `trip_db`; Trip không còn nằm trong booking-service.
5. `trip.status.changed` dùng `fromStatus/toStatus`, có `vehicleTypeId` và `tripDistance`.
6. Fare không còn được client POST để “tính”; payment-service tự tính khi consume Trip `COMPLETED`. API Fare chỉ dùng để tra cứu kết quả.
7. Payment Method chuẩn hóa `CASH / ELECTRONIC`; event payment bổ sung `fareId`, `currency` và dữ liệu truy vết.
8. `review-service`, `report-service`, `audit-service` là service độc lập.
9. `operations.yaml` bị loại bỏ; endpoint được chuyển về đúng domain owner.
10. AsyncAPI dùng Event Envelope theo DDD FINAL.

## 8. Security conventions

```http
Authorization: Bearer <JWT>
```

- 401: thiếu/sai/hết hạn Access Token
- 403: đã xác thực nhưng không đủ Role/Permission hoặc vi phạm ownership
- 409: conflict/state transition không hợp lệ
- 429: Gateway rate limit
- Parameterized query bắt buộc khi truy cập PostgreSQL
- Input/comment phải validate/sanitize
- Driver license mã hóa at rest
- Không lưu card number/CVV/account secret của Payment Provider
