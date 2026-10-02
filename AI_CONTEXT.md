# CAB System - AI Project Context

## 1. Project Overview

CAB System là hệ thống đặt xe trực tuyến (Ride-Hailing Platform) được xây dựng theo:

- Node.js
- Microservices Architecture
- Domain-Driven Design (DDD)
- Database-per-Service
- Event-Driven Architecture
- REST API ở public boundary
- gRPC cho synchronous internal communication
- RabbitMQ cho asynchronous communication
- PostgreSQL 16
- PostGIS cho driver-service
- Redis cho API Gateway
- Docker / Docker Compose

Mục tiêu là triển khai CAB System MVP theo đúng các tài liệu thiết kế đã được khóa.

---

## 2. Source of Truth

Khi có mâu thuẫn, AI KHÔNG được tự suy đoán.

Ưu tiên kiểm tra theo thứ tự:

1. Customer Requirement
2. SRS
3. DDD FINAL
4. ERD FINAL
5. Bounded Context FINAL
6. Microservice Architecture Design FINAL
7. API Specifications FINAL
8. Test Cases FINAL
9. Business Process Model
10. README

Nếu hai tài liệu vẫn mâu thuẫn, phải dừng và báo cho người dùng trước khi thay đổi business rule.

DDD, ERD, Bounded Context và Microservice Architecture hiện tại được xem là baseline đã khóa.

Không tự ý tách/gộp Bounded Context hoặc Microservice.

---

## 3. Final Bounded Contexts

CAB System gồm 10 Bounded Context:

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

---

## 4. Final Microservices

Hệ thống có đúng 10 microservice:

1. auth-service
2. customer-service
3. driver-service
4. booking-service
5. trip-service
6. payment-service
7. notification-service
8. review-service
9. report-service
10. audit-service

Ngoài ra có:

- api-gateway
- RabbitMQ
- Redis
- PostgreSQL/PostGIS
- External Providers

Không được tạo:

- operation-service
- dispatch-service
- user-service

Không được gộp:

- Trip vào booking-service
- Reporting và Audit thành operation-service

---

## 5. Database Ownership

Mỗi service chỉ được trực tiếp đọc/ghi database của chính nó.

Mapping:

- auth-service -> auth_db
- customer-service -> customer_db
- driver-service -> driver_db
- booking-service -> booking_db
- trip-service -> trip_db
- payment-service -> payment_db
- notification-service -> notification_db
- review-service -> review_db
- report-service -> reporting_db
- audit-service -> audit_db

driver_db sử dụng PostgreSQL + PostGIS.

Không được tạo physical foreign key xuyên database.

Các ID xuyên Context chỉ là logical reference.

Ví dụ:

- userId
- customerId
- driverId
- vehicleId
- vehicleTypeId
- bookingId
- tripId
- fareId
- paymentId

---

## 6. Roles

Các Role nghiệp vụ chính được định nghĩa trong DDD:

- CUSTOMER
- DRIVER
- OPERATION_STAFF
- SYSTEM_ADMINISTRATOR

Management / Business Owner là stakeholder trong SRS.

Không tự tạo thêm persisted Role nếu chưa được API/SRS xác nhận.

---

## 7. Booking Rules

Booking Aggregate thuộc booking-service.

Booking chứa:

- Pickup Location
- Destination
- Requested Vehicle Type
- Booking Status
- Driver Offer
- Driver Assignment
- Matching Timeout

Booking Status:

CREATED
-> SEARCHING
-> ASSIGNED

hoặc:

SEARCHING
-> NO_DRIVER_FOUND

ASSIGNED và NO_DRIVER_FOUND là terminal states của Booking Matching trong MVP.

Không tồn tại Dispatch Aggregate hoặc Dispatch Service.

Chỉ Driver có:

ApprovalStatus = APPROVED

và:

AvailabilityStatus = AVAILABLE

mới được tham gia Driver Matching.

Vehicle phải hợp lệ và đúng Requested Vehicle Type.

---

## 8. Driver Rules

ApprovalStatus:

- PENDING_APPROVAL
- APPROVED
- REJECTED

AvailabilityStatus:

- OFFLINE
- AVAILABLE
- BUSY

Không sử dụng ONLINE như giá trị database chính thức.

Driver nhận Trip:

AVAILABLE -> BUSY

Khi Trip kết thúc/hủy phù hợp:

BUSY -> AVAILABLE

Driver Location dùng cho:

- Nearby Driver
- Matching
- ETA

---

## 9. Trip Rules

Trip thuộc duy nhất trip-service.

Trip chỉ được tạo sau Driver Assignment hợp lệ.

driver.accepted được consume bởi trip-service để tạo Trip.

Một bookingId chỉ được tạo tối đa một Trip.

Consumer phải idempotent.

Trip State Machine:

ASSIGNED
-> ARRIVED
-> PICKED_UP
-> IN_PROGRESS
-> COMPLETED

Không được skip state bắt buộc.

COMPLETED và CANCELED là terminal state.

Chỉ assigned Driver được phép cập nhật Trip Status.

Trip lưu:

- Driver
- Vehicle
- Vehicle Type
- Trip Distance
- Trip Status History
- cancellation information

---

## 10. Fare Rules

Fare thuộc payment-service.

Fare chỉ được tạo khi Trip COMPLETED.

Công thức MVP:

Fare =
max(
  MinimumFare,
  BaseFare + TripDistance * PerKmRate
)

Pricing Policy phụ thuộc Vehicle Type.

Fare phải lưu Pricing Policy Snapshot để truy vết.

Không hard-code pricing như business rule cố định nếu chưa có dữ liệu chính thức.

Pricing demo phải nằm trong config/seed và được ghi rõ là giả định MVP.

---

## 11. Payment Rules

Payment thuộc payment-service.

Payment hỗ trợ:

- CASH
- ELECTRONIC

Electronic Payment chỉ COMPLETED sau khi Payment Provider callback được xác thực.

Phải hỗ trợ:

- Idempotency-Key
- replay protection
- duplicate protection
- providerReference
- Payment Transaction

Cùng Idempotency Key và cùng request hợp lệ:

- không tạo Payment mới
- không tạo Transaction mới
- không double charge
- trả kết quả của lần xử lý trước

Không lưu trực tiếp:

- card number
- CVV
- sensitive bank account data

---

## 12. Review Rules

Review thuộc review-service.

Chỉ được tạo khi:

- Trip tồn tại
- Trip thuộc Customer
- Trip COMPLETED
- Customer chưa Review Trip đó

Review gồm:

- Score
- Comment

Comment phải được validate/sanitize.

Sau khi tạo thành công publish:

review.created

---

## 13. RabbitMQ

Message broker:

RabbitMQ

Exchange:

cab.events

Exchange type:

topic

Domain/Integration Events:

- booking.created
- driver.offer.created
- booking.no_driver_found
- driver.accepted
- trip.status.changed
- trip.canceled
- payment.completed
- payment.failed
- review.created

Event Envelope chuẩn:

- eventId
- eventType
- occurredAt
- producer
- correlationId
- schemaVersion
- payload

Consumer phải idempotent.

Event không chuyển ownership Aggregate.

Consumer chỉ được cập nhật database của chính mình.

---

## 14. Event Ownership

booking-service publishes:

- booking.created
- driver.offer.created
- booking.no_driver_found
- driver.accepted

trip-service consumes:

- driver.accepted

trip-service publishes:

- trip.status.changed
- trip.canceled

driver-service consumes:

- driver.accepted
- trip.status.changed
- trip.canceled

payment-service consumes:

- trip.status.changed when toStatus = COMPLETED

payment-service publishes:

- payment.completed
- payment.failed

notification-service consumes business events required by DDD.

review-service publishes:

- review.created

report-service consumes:

- trip.status.changed
- trip.canceled
- payment.completed
- payment.failed
- review.created

audit-service consumes relevant critical business events according to DDD.

---

## 15. Communication Rules

Public communication:

Client
-> REST API HTTPS/JSON
-> API Gateway

Internal synchronous communication:

API Gateway
-> gRPC
-> Microservices

Important service-to-service gRPC:

Booking Service
-> Customer Service
Validate / Get Customer

Booking Service
-> Driver Service
Driver Matching / Nearby Driver

Trip Service
-> Driver Service
Driver Location / ETA

Review Service
-> Trip Service
Validate Completed Trip

Do not introduce synchronous coupling when RabbitMQ event communication already satisfies the requirement.

---

## 16. External Providers

### Map / Routing Provider

Used mainly by trip-service for:

- Route
- Distance
- ETA

### Payment Provider

Used by payment-service for:

- electronic payment
- callback / webhook

### Notification Provider

Used by notification-service for:

- SMS
- Push
- Email

MVP may use mock providers.

---

## 17. API Gateway

API Gateway handles:

- Routing
- JWT validation
- Authentication
- coarse-grained Authorization
- Rate Limiting
- Request Correlation
- Logging
- Monitoring
- Error handling

Gateway must NOT contain domain business logic.

Business authorization must still be enforced inside the owning service.

Example:

Trip Service must verify that the Driver updating a Trip is the assigned Driver.

---

## 18. Redis

Redis is infrastructure.

Used primarily for:

- API Gateway caching
- rate limiting
- temporary/session-like data when needed

Redis is NOT source of truth for business data.

---

## 19. Security Requirements

Must protect against:

- plaintext password storage
- SQL injection
- XSS
- invalid JWT
- expired JWT
- JWT tampering
- unauthorized access
- forbidden role access
- sensitive data exposure
- payment replay
- duplicate charge

Use:

- bcrypt
- parameterized queries
- validation
- sanitization
- Helmet / security headers
- rate limiting
- encryption where required

.env and secrets must never be committed.

---

## 20. Health Checks

API Gateway:

- GET /health
- GET /ready
- GET /health/services

Each microservice:

- GET /health
- GET /ready

/ready must verify required dependencies.

---

## 21. Repository Rules

Do not modify architecture without explicit approval.

Do not create files outside the intended service boundary.

Keep business logic out of controllers/routes.

Preferred separation:

- domain
- repositories
- services
- grpc
- events
- providers
- config

Shared infrastructure helpers may live under /shared.

Avoid sharing domain models between microservices.

---

## 22. AI Working Model

ChatGPT is the main AI coordinator.

Three logical roles are used:

### BA Agent

Responsible for:

- requirement analysis
- SRS/DDD/API interpretation
- business rule validation
- acceptance criteria clarification
- preventing requirement drift

### Dev Agent

Responsible for:

- implementation
- database
- gRPC
- RabbitMQ
- API Gateway
- Docker
- security implementation

### Test Agent

Responsible for:

- functional testing
- integration testing
- security testing
- event verification
- database verification
- 30-criteria traceability

A feature should follow:

BA analysis
-> Dev implementation
-> Test verification
-> PASS / FAIL

If FAIL:

Test
-> Dev fix
-> Test again

---

## 23. Development Principles

Priority:

Correctness
-> Consistency with DDD
-> Security
-> Testability
-> Simplicity
-> Performance

Avoid over-engineering.

Do not invent business rules.

Do not silently change API contracts.

Do not bypass Gateway for client-facing requests.

Do not allow service to directly query another service's database.

---

## 24. Definition of Done

A feature is DONE only when:

- requirement is identified
- owning service is correct
- API contract is respected
- database ownership is respected
- validation exists
- authorization exists
- tests pass
- event publish/consume is verified when applicable
- database result is verified
- error cases are tested
- documentation is updated if necessary
- corresponding Test Cases / rubric criteria are satisfied