# Workflow - Run Tests

## Purpose

Quy trình chuẩn để kiểm tra CAB System.

---

## 1. Environment Check

Kiểm tra:

docker compose ps

Các infrastructure cần thiết phải sẵn sàng:

- PostgreSQL
- RabbitMQ
- Redis

---

## 2. Health Check

Gateway:

GET /health
GET /ready
GET /health/services

Service liên quan:

GET /health
GET /ready

---

## 3. Authentication Setup

Chuẩn bị account/token cho:

- CUSTOMER
- DRIVER
- OPERATION_STAFF
- SYSTEM_ADMINISTRATOR

Không dùng cùng một token cho mọi test role.

---

## 4. Functional Tests

Chạy test case của feature.

Ghi:

- request
- response
- HTTP status
- expected
- actual

---

## 5. Database Verification

Kiểm database của owning service.

Không truy cập database khác để giả lập nghiệp vụ.

---

## 6. gRPC Verification

Nếu feature có gRPC:

- request thành công;
- response đúng;
- invalid request;
- unavailable dependency nếu cần.

---

## 7. RabbitMQ Verification

Nếu feature có event:

- event được publish;
- routing key đúng;
- payload đúng;
- consumer nhận;
- side effect đúng.

Sau đó thử delivery duplicate nếu feature cần idempotency.

---

## 8. Negative Tests

Test:

- invalid input;
- missing field;
- invalid state;
- wrong user;
- wrong role;
- duplicate request;
- not found.

---

## 9. Security Tests

Khi phù hợp:

- no token -> 401
- invalid token -> 401
- expired token -> 401
- wrong role -> 403
- SQL injection
- XSS
- JWT tamper
- replay
- rate limit

---

## 10. Regression

Kiểm những feature có liên quan.

Ví dụ:

Booking Accept
→ Trip creation
→ Driver BUSY
→ Notification

Trip COMPLETED
→ Driver AVAILABLE
→ Fare
→ Payment
→ Notification
→ Reporting
→ Audit

---

## 11. Result

Test Agent phải trả:

PASS

FAIL

hoặc:

BLOCKED

Không dùng kết luận mơ hồ như:

"có vẻ ổn"
"chắc chạy được"
"gần đúng"

Nếu FAIL phải có defect report rõ ràng.