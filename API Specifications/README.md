# CAB System – API Specifications

## 1. Mục đích

Bộ tài liệu này mô tả REST API và asynchronous event contract của CAB System sau khi đồng bộ với:

- SRS hiện tại.
- DDD FINAL.
- Customer Requirement.
- Các tiêu chí demo/acceptance của bài CAB System.

REST API được mô tả bằng OpenAPI 3.0.3.  
Giao tiếp bất đồng bộ qua RabbitMQ được mô tả trong `asyncapi.yaml`.

---

## 2. Quy ước chung

- External business base URL: `http://localhost:8080/api/v1`
- Tất cả business request từ client phải đi qua **API Gateway**.
- Health endpoints dùng Gateway base URL: `http://localhost:8080`
- Protected API dùng:

```http
Authorization: Bearer <JWT>
```

- Thiếu hoặc sai token: `401 Unauthorized`
- Token hợp lệ nhưng không đủ quyền: `403 Forbidden`
- Vượt rate limit: `429 Too Many Requests`
- Booking/Payment cần chống request lặp sử dụng `Idempotency-Key` tại các API tương ứng.
- Client không gọi trực tiếp internal microservice endpoint.
- CAB System không lưu trực tiếp số thẻ, CVV hoặc dữ liệu tài khoản thanh toán nhạy cảm.
- Driver license cần được mã hóa khi lưu trữ theo thiết kế DDD.

---

## 3. Quy ước định danh

Các ID sau là các định danh khác nhau và không được dùng thay thế lẫn nhau:

| ID | Ý nghĩa | Ví dụ |
|---|---|---|
| `userId` | User trong Identity & Access | `U001` |
| `customerId` | Customer Profile | `C001` |
| `driverId` | Driver | `DRV001` |
| `vehicleId` | Vehicle | `VEH001` |
| `bookingId` | Booking | `BKG001` |
| `tripId` | Trip | `TRIP001` |
| `paymentId` | Payment | `PAY001` |
| `reviewId` | Review | `REV001` |

Ví dụ tra cứu Customer theo ID:

```http
GET /api/v1/users/customers/C001
Authorization: Bearer <JWT>
```

Path trên dùng `customerId`, không dùng `userId`.

---

## 4. Trạng thái nghiệp vụ chính

### Driver Approval Status

```text
PENDING_APPROVAL
APPROVED
REJECTED
```

### Driver Availability Status

```text
OFFLINE
AVAILABLE
BUSY
```

Driver chỉ được tham gia matching khi:

```text
ApprovalStatus = APPROVED
AND
AvailabilityStatus = AVAILABLE
```

Thao tác Driver Online trong nghiệp vụ được ánh xạ sang `AVAILABLE` khi Driver đủ điều kiện.

### Trip State Machine

```text
ASSIGNED
   ↓
ARRIVED
   ↓
PICKED_UP
   ↓
IN_PROGRESS
   ↓
COMPLETED
```

`CANCELED` là trạng thái kết thúc hợp lệ theo business rule.

`COMPLETED` và `CANCELED` là terminal states.

---

## 5. Danh sách file API

| File | Nội dung chính |
|---|---|
| `authentication.yaml` | Customer register/login/logout; Driver OTP và onboarding |
| `users.yaml` | Hồ sơ hiện tại, danh sách Customer, Customer theo `customerId` |
| `drivers.yaml` | Driver profile, nearby drivers, availability, location |
| `vehicles.yaml` | Vehicle và thông tin `licensePlate`, brand, model |
| `bookings.yaml` | Create Booking, Booking detail/history, Driver Offer, Accept/Reject |
| `trips.yaml` | Trip detail, State Machine, Cancel, Review REST endpoint |
| `fare.yaml` | Tính Fare cho Trip |
| `payments.yaml` | Payment, callback, retry, idempotency |
| `notifications.yaml` | Tra cứu và đánh dấu Notification |
| `operations.yaml` | Ongoing/abnormal Trip, transaction monitoring, Driver approval |
| `authorization.yaml` | Role và Permission |
| `audit.yaml` | Audit Log |
| `reports.yaml` | Trip Report, Revenue Report, Driver Performance |
| `health.yaml` | `/health`, `/ready`, `/health/services` |
| `asyncapi.yaml` | RabbitMQ event contract |

Lưu ý: REST route `/trips/{tripId}/reviews` được expose qua API Gateway; implementation có thể route request này đến `review-service`, đúng ownership của Rating & Review Context.

---

## 6. Microservice và dữ liệu sở hữu

| Bounded Context | Service | Database |
|---|---|---|
| Identity & Access | `auth-service` | `auth_db` |
| User Profile | `customer-service` | `customer_db` |
| Driver & Vehicle Management | `driver-service` | `driver_db` |
| Booking & Dispatch | `booking-service` | `booking_db` |
| Trip Management | `booking-service` | `booking_db` |
| Fare & Payment | `payment-service` | `payment_db` |
| Notification | `notification-service` | `notification_db` |
| Rating & Review | `review-service` | `review_db` |
| Reporting | `operation-service` | `operation_db` |
| Audit | `operation-service` | `operation_db` |

Gateway là entry point của hệ thống và không phải Bounded Context.

---

## 7. RabbitMQ / AsyncAPI

Exchange dự kiến:

```text
cab.events
```

Loại:

```text
topic
```

Danh sách 9 event chính thức:

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

### Event routing theo DDD

| Event | Producer | Consumer chính |
|---|---|---|
| `booking.created` | Booking & Dispatch | Driver Matching, Notification |
| `driver.offer.created` | Booking & Dispatch | Notification |
| `booking.no_driver_found` | Booking & Dispatch | Notification, Audit |
| `driver.accepted` | Booking & Dispatch | Trip Management, Driver Management, Notification |
| `trip.status.changed` | Trip Management | Driver Management, Notification, Fare/Payment, Reporting, Audit |
| `trip.canceled` | Trip Management | Driver Management, Notification, Reporting, Audit |
| `payment.completed` | Fare & Payment | Notification, Reporting, Audit |
| `payment.failed` | Fare & Payment | Notification, Reporting, Audit |
| `review.created` | Rating & Review | Reporting |

---

## 8. Các API quan trọng để demo

### Authentication

```text
POST /api/v1/auth/customers/register
POST /api/v1/auth/login
POST /api/v1/auth/drivers/otp/request
POST /api/v1/auth/drivers/otp/verify
POST /api/v1/auth/drivers/register
```

### Customer

```text
GET /api/v1/users/me
PUT /api/v1/users/me
GET /api/v1/users/customers
GET /api/v1/users/customers/{customerId}
GET /api/v1/customers/me/bookings
```

### Driver

```text
GET /api/v1/drivers/{driverId}
GET /api/v1/drivers/nearby
PUT /api/v1/drivers/me/availability
PUT /api/v1/drivers/me/location
GET /api/v1/drivers/me/offers
```

### Booking

```text
POST /api/v1/bookings
GET /api/v1/bookings/{bookingId}
POST /api/v1/bookings/{bookingId}/accept
POST /api/v1/bookings/{bookingId}/reject
```

### Trip

```text
GET /api/v1/trips/{tripId}
PATCH /api/v1/trips/{tripId}/status
POST /api/v1/trips/{tripId}/cancel
POST /api/v1/trips/{tripId}/reviews
```

Trip transition hợp lệ phải tuân thủ State Machine và không được skip trạng thái bắt buộc.

### Payment

```text
POST /api/v1/trips/{tripId}/payments
GET /api/v1/payments/{paymentId}
POST /api/v1/payments/provider/callback
POST /api/v1/payments/{paymentId}/retry
```

Payment replay với cùng `Idempotency-Key` không được tạo double charge và phải trả lại kết quả phù hợp của request đã xử lý trước.

### Operation / Reporting / Audit

```text
GET /api/v1/operations/trips/active
GET /api/v1/operations/trips/abnormal
GET /api/v1/operations/drivers/pending
PATCH /api/v1/operations/drivers/{driverId}/approval

GET /api/v1/reports/trips
GET /api/v1/reports/revenue
GET /api/v1/reports/drivers

GET /api/v1/audit-logs
```

### Health

```text
GET http://localhost:8080/health
GET http://localhost:8080/ready
GET http://localhost:8080/health/services
```

---

## 9. Security và robustness

Implementation phải bảo đảm:

- Password được hash, không lưu plaintext.
- JWT phải được verify signature và authorization theo Role/Permission.
- Customer không được truy cập Driver/Admin API nếu không có quyền.
- Driver license hoặc dữ liệu nhạy cảm cần khôi phục phải được mã hóa at rest.
- SQL phải dùng parameterized query/prepared statement.
- Comment/field hiển thị phải được validate/sanitize để hạn chế XSS.
- Gateway thực thi rate limiting và trả `429` khi vượt giới hạn.
- Payment callback phải được xác thực và ánh xạ đúng Payment.
- Payment request phải idempotent.
- Notification failure không được rollback nghiệp vụ Booking/Trip/Payment chính.

---

## 10. Quy tắc đồng bộ tài liệu

Khi thay đổi business contract:

1. Cập nhật SRS/DDD nếu business rule thay đổi.
2. Cập nhật OpenAPI file tương ứng.
3. Nếu event thay đổi, cập nhật `asyncapi.yaml`.
4. Cập nhật implementation.
5. Cập nhật Postman/Test Case tương ứng.

Không tự ý thay đổi tên field giữa DDD, API contract và source code nếu không có lý do rõ ràng.

Một số tên đã được chuẩn hóa trong bản hiện tại:

```text
customerId   (không dùng userId thay cho Customer ID)
licensePlate (không dùng plateNumber)
score        (Review score, không dùng rating trong Review payload)
Fare         (không dùng CuocPhi)
actorId / entityType / entityId trong Audit Log
```

---

## 11. Trạng thái bộ API hiện tại

Bộ API này được dùng làm baseline cho implementation.

Các contract trọng yếu đã được đồng bộ với DDD FINAL:

- 9 RabbitMQ events.
- Customer lookup theo `customerId`.
- Driver approval/availability.
- Nearby Driver.
- Booking/Offer/Accept/Reject.
- Trip State Machine và Cancellation.
- Fare/Payment callback/idempotency.
- Review dùng `score`.
- Audit Log.
- Trip/Revenue/Driver Performance reports.
- Health/Ready/Service health.
- JWT/RBAC/rate-limit error contracts.

Trong quá trình implementation, chỉ thay đổi contract khi phát hiện mâu thuẫn thực tế hoặc có thay đổi yêu cầu được chấp thuận.
