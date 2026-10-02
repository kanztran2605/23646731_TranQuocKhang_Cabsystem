# 🚕 CAB System – Service-Oriented Ride Booking Platform

> **Môn học:** Lập Trình Hướng Dịch Vụ  
> **Sinh viên:** Trần Quốc Khang  
> **MSSV:** 23646731  

---

## 1. Giới thiệu

CAB System là nền tảng đặt xe trực tuyến được xây dựng theo kiến trúc:

- Microservices Architecture
- Domain-Driven Design (DDD)
- Database-per-Service
- Event-Driven Architecture
- REST API
- gRPC
- RabbitMQ
- PostgreSQL
- PostGIS
- Redis
- Docker
- Docker Compose

Mục tiêu của hệ thống là hỗ trợ toàn bộ quy trình đặt xe từ khi Customer tạo yêu cầu đặt xe cho đến khi Trip hoàn thành, tính cước, thanh toán, gửi thông báo, đánh giá Driver và tổng hợp báo cáo.

Luồng nghiệp vụ tổng quát:

```text
Customer
   ↓
Create Booking
   ↓
Driver Matching
   ↓
Driver Offer
   ↓
Driver Assignment
   ↓
Trip
   ↓
Fare
   ↓
Payment
   ↓
Notification
   ↓
Review
   ↓
Reporting / Audit
```

---

## 2. Kiến trúc tổng thể

Luồng giao tiếp từ Client vào hệ thống:

```text
Client
   │
   │ REST API (HTTPS/JSON)
   ▼
API Gateway
   │
   │ gRPC (synchronous)
   ▼
Microservices
```

Giao tiếp bất đồng bộ giữa các Microservice sử dụng:

```text
RabbitMQ
Exchange: cab.events
```

API Gateway chịu trách nhiệm:

- Routing
- Authentication
- Authorization mức Gateway
- JWT Validation
- Rate Limiting
- Request Correlation
- Logging
- Monitoring
- Error Handling

Redis được sử dụng cho:

- Cache
- Rate Limiting
- Temporary Gateway Data

---

## 3. Microservices

CAB System gồm 10 Microservices chính:

| # | Service | Trách nhiệm chính | Database |
|---|---|---|---|
| 1 | `auth-service` | Authentication, Authorization, JWT, OTP, Role/Permission | `auth_db` |
| 2 | `customer-service` | Quản lý Customer Profile | `customer_db` |
| 3 | `driver-service` | Driver, Vehicle, Vehicle Type, Location, Approval, Availability | `driver_db` |
| 4 | `booking-service` | Booking, Driver Matching, Driver Offer, Driver Assignment | `booking_db` |
| 5 | `trip-service` | Trip Lifecycle, State Machine, ETA, Trip History | `trip_db` |
| 6 | `payment-service` | Fare, Payment, Transaction, Provider Callback | `payment_db` |
| 7 | `notification-service` | Notification và Delivery Status | `notification_db` |
| 8 | `review-service` | Review và Driver Rating | `review_db` |
| 9 | `report-service` | Trip Report, Revenue Report, Driver Performance | `reporting_db` |
| 10 | `audit-service` | Audit Log và truy vết hoạt động | `audit_db` |

Ngoài ra hệ thống còn có:

- API Gateway
- RabbitMQ
- Redis
- PostgreSQL 16
- PostGIS
- Map / Routing Provider
- Payment Provider
- Notification Provider

---

## 4. Bounded Contexts

CAB System được chia thành 10 Bounded Context:

1. Identity & Access
2. Customer Management
3. Driver & Vehicle Management
4. Booking Management
5. Trip Management
6. Fare & Payment
7. Notification
8. Rating & Review
9. Reporting
10. Audit

Mỗi Bounded Context có ownership riêng và không được truy cập trực tiếp database của Context khác.

---

## 5. Database-per-Service

Mapping giữa Microservice và Database:

```text
auth-service
→ auth_db

customer-service
→ customer_db

driver-service
→ driver_db
→ PostgreSQL + PostGIS

booking-service
→ booking_db

trip-service
→ trip_db

payment-service
→ payment_db

notification-service
→ notification_db

review-service
→ review_db

report-service
→ reporting_db

audit-service
→ audit_db
```

Trong môi trường local development, các database có thể chạy trong cùng một PostgreSQL instance nhưng vẫn phải giữ logical ownership riêng biệt.

Không tạo Physical Foreign Key xuyên database của các Microservice.

Các ID xuyên Context chỉ được sử dụng như Logical Reference.

Ví dụ:

```text
userId
customerId
driverId
vehicleId
vehicleTypeId
bookingId
tripId
fareId
paymentId
```

---

## 6. Giao tiếp giữa các thành phần

### 6.1 Client → API Gateway

```text
REST API
HTTPS / JSON
```

Client không gọi trực tiếp Microservice.

---

### 6.2 API Gateway → Microservice

```text
gRPC
synchronous
```

API Gateway gọi các Microservice nội bộ thông qua gRPC.

---

### 6.3 Service-to-Service gRPC

Các dependency synchronous chính:

```text
Booking Service
→ Customer Service
Validate / Get Customer
```

```text
Booking Service
→ Driver Service
Driver Matching / Nearby Driver
```

```text
Trip Service
→ Driver Service
Driver Location / ETA
```

```text
Review Service
→ Trip Service
Validate Completed Trip
```

---

### 6.4 RabbitMQ

Các giao tiếp bất đồng bộ sử dụng RabbitMQ.

Exchange:

```text
cab.events
```

Các Domain / Integration Event chính:

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

Event Envelope chuẩn gồm:

```text
eventId
eventType
occurredAt
producer
correlationId
schemaVersion
payload
```

Consumer phải xử lý event theo cơ chế idempotent.

---

## 7. Booking Management

Booking Status:

```text
CREATED
   │
   ▼
SEARCHING
   │
   ├────────→ ASSIGNED
   │
   └────────→ NO_DRIVER_FOUND
```

Driver Matching chỉ được chọn Driver thỏa:

```text
ApprovalStatus = APPROVED
AND
AvailabilityStatus = AVAILABLE
```

Vehicle phải phù hợp với Requested Vehicle Type.

Booking Service chịu trách nhiệm:

- Create Booking
- Driver Matching
- Driver Offer
- Accept
- Reject
- Timeout
- Driver Assignment
- No Driver Found

Không sử dụng `Dispatch Service` hoặc `Dispatch Aggregate`.

---

## 8. Driver & Vehicle Management

Approval Status:

```text
PENDING_APPROVAL
APPROVED
REJECTED
```

Availability Status:

```text
OFFLINE
AVAILABLE
BUSY
```

Khi Driver nhận Trip:

```text
AVAILABLE
→ BUSY
```

Khi Trip kết thúc hoặc bị hủy phù hợp:

```text
BUSY
→ AVAILABLE
```

Driver Location được sử dụng cho:

- Nearby Driver
- Driver Matching
- ETA

`driver_db` sử dụng PostgreSQL kết hợp PostGIS.

---

## 9. Trip Management

Trip được tạo khi Trip Service consume:

```text
driver.accepted
```

Initial Status:

```text
ASSIGNED
```

Trip State Machine:

```text
ASSIGNED
   │
   ▼
ARRIVED
   │
   ▼
PICKED_UP
   │
   ▼
IN_PROGRESS
   │
   ▼
COMPLETED
```

Ngoài ra Trip có thể chuyển sang:

```text
CANCELED
```

`COMPLETED` và `CANCELED` là terminal state.

Các rule quan trọng:

- Trip chỉ được tạo sau Driver Assignment hợp lệ.
- Một `bookingId` chỉ được tạo tối đa một Trip.
- Chỉ assigned Driver được phép cập nhật Trip Status.
- Không được skip trạng thái bắt buộc.
- Trip phải lưu Trip Status History.
- Trip lưu Trip Distance.
- Trip có thể lưu Cancel Reason khi bị hủy.

---

## 10. Fare

Fare chỉ được tính khi:

```text
Trip Status = COMPLETED
```

Công thức MVP:

```text
Fare =
max(
    MinimumFare,
    BaseFare + TripDistance * PerKmRate
)
```

Pricing Policy được xác định theo Vehicle Type.

Fare phải lưu Pricing Policy Snapshot để hỗ trợ truy vết cách tính.

---

## 11. Payment

Payment hỗ trợ:

```text
CASH
ELECTRONIC
```

Electronic Payment sử dụng Payment Provider.

Payment Service phải hỗ trợ:

- Payment Transaction
- Payment Callback
- Provider Reference
- Idempotency Key
- Replay Protection
- Duplicate Protection
- Double-charge Prevention

Không lưu trực tiếp:

```text
Card Number
CVV
Sensitive Bank Account Data
```

---

## 12. Notification

Notification Service consume các business event từ RabbitMQ.

Các loại thông báo có thể bao gồm:

- Booking được tiếp nhận
- Driver Offer
- Driver Assignment
- Không tìm được Driver
- Trip Status Changed
- Trip Canceled
- Payment Completed
- Payment Failed

Notification Provider hỗ trợ:

```text
SMS
Push Notification
Email
```

Lỗi Notification không được rollback nghiệp vụ chính.

---

## 13. Rating & Review

Customer chỉ được Review khi:

```text
Trip tồn tại
AND
Trip thuộc Customer
AND
Trip Status = COMPLETED
AND
Trip chưa được Review
```

Review gồm:

- Score
- Comment

Sau khi Review được tạo thành công:

```text
Publish: review.created
```

---

## 14. Reporting

Report Service tổng hợp dữ liệu phục vụ:

- Trip Report
- Revenue Report
- Trip Count
- Completion Rate
- Cancellation Rate
- Driver Performance

Report Service consume các event cần thiết từ RabbitMQ.

Database:

```text
reporting_db
```

---

## 15. Audit

Audit Service chịu trách nhiệm:

- Audit Log
- Actor
- Action
- Entity Type
- Entity ID
- Success / Failure
- IP Address
- Timestamp
- Metadata

Database:

```text
audit_db
```

Audit Service được triển khai độc lập với Report Service.

Không sử dụng:

```text
operation-service
operation_db
```

---

## 16. External Providers

### Map / Routing Provider

Được sử dụng chủ yếu bởi Trip Service để lấy:

- Route
- Distance
- ETA

---

### Payment Provider

Được sử dụng bởi Payment Service cho:

- Electronic Payment
- Provider API
- Payment Callback / Webhook

---

### Notification Provider

Được sử dụng bởi Notification Service cho:

- SMS
- Push Notification
- Email

Trong phạm vi MVP có thể sử dụng Mock Provider.

---

## 17. Project Structure

```text
23646731_TranQuocKhang_Cabsystem/
│
├── .ai/
│   ├── agents/
│   │   ├── ba-agent.md
│   │   ├── dev-agent.md
│   │   └── test-agent.md
│   │
│   └── workflows/
│       ├── implement-feature.md
│       ├── review-feature.md
│       └── run-tests.md
│
├── contracts/
│   └── events/
│
├── docs/
│   ├── requirements/
│   ├── architecture/
│   ├── api/
│   ├── test/
│   ├── prompts/
│   └── reports/
│
├── infrastructure/
│   ├── postgres/
│   ├── rabbitmq/
│   ├── redis/
│   └── docker/
│
├── postman/
├── proto/
├── scripts/
│
├── services/
│   ├── api-gateway/
│   ├── auth-service/
│   ├── customer-service/
│   ├── driver-service/
│   ├── booking-service/
│   ├── trip-service/
│   ├── payment-service/
│   ├── notification-service/
│   ├── review-service/
│   ├── report-service/
│   └── audit-service/
│
├── shared/
│
├── .env.example
├── .gitignore
├── .dockerignore
├── .gitattributes
├── AI_CONTEXT.md
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 18. AI Development Workflow

ChatGPT được sử dụng làm Main AI Coordinator của project.

Ba logical agent:

```text
BA Agent
→ Requirement / Business Rule Analysis

Dev Agent
→ Implementation

Test Agent
→ Verification
```

Workflow:

```text
BA Analysis
    │
    ▼
Dev Implementation
    │
    ▼
Test Verification
    │
    ├── PASS → Done
    │
    └── FAIL → Dev Fix → Retest
```

AI Project Context:

```text
AI_CONTEXT.md
```

Agent Instructions:

```text
.ai/agents/
```

Workflow Instructions:

```text
.ai/workflows/
```

---

## 19. Environment

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

`.env` chỉ được dùng cho môi trường local và không được commit lên Git.

Kiểm tra:

```bash
git check-ignore -v .env
```

---

## 20. Docker

Kiểm tra Docker Compose:

```bash
docker compose config
```

Sau khi các service đã được triển khai:

```bash
docker compose up -d --build
```

Kiểm tra:

```bash
docker compose ps
```

Xem log:

```bash
docker compose logs -f
```

Dừng hệ thống:

```bash
docker compose down
```

---

## 21. Health Check

API Gateway:

```text
GET /health
GET /ready
GET /health/services
```

Mỗi Microservice:

```text
GET /health
GET /ready
```

`/ready` phải kiểm tra các dependency quan trọng của service.

---

## 22. Security

CAB System phải hỗ trợ:

- Password Hashing
- JWT Validation
- Authentication
- Authorization
- Input Validation
- SQL Injection Protection
- XSS Protection
- Rate Limiting
- JWT Tampering Protection
- Payment Replay Protection
- Idempotency
- Sensitive Data Protection
- Security Headers

Không commit:

```text
.env
Password
JWT Secret
API Key
Private Key
Payment Secret
```

---

## 23. Documentation

Tài liệu chính nằm trong:

```text
docs/
```

Bao gồm:

- Customer Requirement
- SRS
- DDD
- ERD
- Bounded Context
- Business Process Model
- Microservice Architecture Design
- API Specifications
- Test Cases
- Prompt Microservice

---

## 24. Current Project Status

Trạng thái hiện tại:

```text
Architecture Design       ✅
DDD                       ✅
ERD                       ✅
Bounded Context           ✅
Business Process Model    ✅
API Specifications        ✅
Test Cases                ✅
Repository Skeleton       ✅
AI Workflow Skeleton      ✅
Microservice Source Code  🚧
Infrastructure Code       🚧
Integration Testing       ⏳
```

Quy trình triển khai:

```text
Requirement
   ↓
DDD
   ↓
API Contract
   ↓
BA Analysis
   ↓
Implementation
   ↓
Testing
   ↓
PASS
```

Không thay đổi Service Boundary, Business Rule hoặc API Contract nếu chưa được xác nhận.

---

## 25. Repository

Project:

```text
23646731_TranQuocKhang_Cabsystem
```

Branch triển khai hiện tại:

```text
main
```

Mỗi milestone nên được commit riêng để dễ kiểm tra và rollback.