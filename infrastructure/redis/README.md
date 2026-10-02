# CAB System Redis Infrastructure

## 1. Purpose

Redis là infrastructure component của CAB System.

Redis được sử dụng chủ yếu cho:

```text
API Gateway cache
Rate limiting
Temporary coordination data
Booking idempotency metadata
```

Redis KHÔNG phải source of truth cho business data.

Business data chính thức vẫn thuộc database của owning microservice:

```text
Identity / Access   -> auth_db
Customer            -> customer_db
Driver / Vehicle    -> driver_db
Booking             -> booking_db
Trip                -> trip_db
Payment / Fare      -> payment_db
Notification        -> notification_db
Review              -> review_db
Reporting           -> reporting_db
Audit               -> audit_db
```

Không lưu business Aggregate thay cho PostgreSQL trong Redis.

---

## 2. Architecture

CAB System sử dụng Redis chủ yếu ở API Gateway và cho các temporary coordination concern được phép.

```text
Client
   |
   | REST / HTTPS
   v
API Gateway
   |
   +------ Redis
   |       |
   |       +--> Rate Limit
   |       +--> Cache
   |       +--> Temporary Coordination
   |
   +------ gRPC
           |
           v
      Microservices
           |
           v
       PostgreSQL
```

Redis không thay thế:

```text
PostgreSQL
RabbitMQ
gRPC
```

---

## 3. Docker service

Docker Compose service:

```text
redis
```

Container:

```text
cab-redis
```

Internal Docker endpoint:

```text
redis:6379
```

Redis không cần expose port `6379` ra host trong CAB System.

Các service trong:

```text
cab-network
```

kết nối Redis bằng:

```text
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<value-from-env>
```

Credential không được hard-code trong source code.

---

## 4. Persistence

Local Redis chạy với:

```text
appendonly yes
```

và named Docker volume:

```text
cab_redis_data
```

AOF giúp local development giữ infrastructure data cần thiết qua container restart.

Tuy nhiên Redis vẫn không được coi là authoritative business storage.

Nếu Redis mất cache hoặc temporary coordination data, business records trong PostgreSQL phải vẫn là nguồn dữ liệu chính thức.

---

## 5. Allowed Redis data

### 5.1 Rate limiting

API Gateway có thể lưu bộ đếm request tạm thời.

Key namespace:

```text
cab:gateway:ratelimit:<scope>:<identity>:<window>
```

Ví dụ:

```text
cab:gateway:ratelimit:api:user-123:1760000000
```

TTL phải gắn với rate-limit window.

Config hiện tại:

```text
RATE_LIMIT_WINDOW_MS
RATE_LIMIT_MAX_REQUESTS
```

Khi vượt giới hạn:

```text
HTTP 429 Too Many Requests
```

Rate limit được enforce tại API Gateway.

Không đặt domain business rule trong rate limiter.

---

### 5.2 API Gateway cache

Cache namespace:

```text
cab:gateway:cache:<namespace>:<key>
```

Ví dụ:

```text
cab:gateway:cache:vehicle-types:list
```

Mọi cache key phải có TTL hữu hạn.

Cache chỉ dùng để cải thiện hiệu năng.

Cache miss phải có khả năng lấy lại dữ liệu từ owning service.

Không được coi giá trị cache là business source of truth.

Không cache tùy tiện:

```text
password
JWT secret
refresh token plaintext
OTP plaintext
driver license plaintext
payment sensitive data
```

---

### 5.3 Temporary Gateway data

Temporary namespace:

```text
cab:gateway:temp:<scope>:<id>
```

Temporary data phải:

```text
có TTL
không phải business Aggregate
không thay PostgreSQL
không chứa secret plaintext không cần thiết
```

---

## 6. Booking idempotency

OpenAPI yêu cầu:

```text
POST /bookings
Idempotency-Key: required
```

Booking ERD không có physical column `idempotency_key`.

Vì vậy CAB System có thể sử dụng Redis làm temporary idempotency coordination store cho Create Booking.

Namespace:

```text
cab:booking:idempotency:<customerId>:<keyHash>
```

Trong đó:

```text
keyHash = SHA-256(Idempotency-Key)
```

Không dùng nguyên user-supplied Idempotency-Key làm business identifier.

Redis record có thể giữ coordination metadata dạng:

```json
{
  "requestHash": "sha256-of-normalized-request",
  "status": "PROCESSING",
  "bookingId": null
}
```

Sau khi Booking persist thành công:

```json
{
  "requestHash": "sha256-of-normalized-request",
  "status": "COMPLETED",
  "bookingId": "1"
}
```

Nguyên tắc xử lý:

```text
same Idempotency-Key
+ same request
=> không tạo Booking mới
=> trả Booking đã tạo trước đó
```

Nếu:

```text
same Idempotency-Key
+ different request payload
```

thì request phải bị từ chối vì conflict.

Redis chỉ giữ idempotency coordination metadata.

Business Booking thực tế vẫn được đọc từ:

```text
booking_db
```

TTL cụ thể cho Booking idempotency sẽ được cấu hình khi triển khai `booking-service`; không hard-code policy tùy ý tại infrastructure layer.

---

## 7. Payment idempotency

Payment có invariant mạnh hơn Booking.

ERD và SRS đã khóa:

```text
payment.idempotency_key UNIQUE
```

Do đó correctness của Payment idempotency phải dựa trên:

```text
payment_db
```

Không được chỉ dựa vào Redis.

Luồng chính:

```text
Payment request
      |
      v
payment-service
      |
      +--> lookup idempotency_key
      |
      +--> UNIQUE constraint in payment_db
      |
      v
return previous Payment when replayed
```

Redis có thể được sử dụng sau này như optimization/cache nếu cần, nhưng:

```text
Redis loss
```

không được làm mất khả năng chống:

```text
duplicate Payment
double charge
replay
```

---

## 8. RabbitMQ idempotency is separate

RabbitMQ consumer idempotency không được nhầm với HTTP Idempotency-Key.

RabbitMQ dùng:

```text
eventId
```

để hỗ trợ deduplication.

Shared contract:

```text
shared/rabbitmq/consumer.js
```

Consumer phải đảm bảo cùng event không gây duplicate side effect.

Không tạo một global Redis business database dùng chung để sở hữu deduplication của mọi bounded context.

Idempotency side effect cuối cùng vẫn thuộc owning service.

---

## 9. Key naming convention

Tất cả CAB Redis keys phải bắt đầu bằng:

```text
cab:
```

Approved namespaces:

```text
cab:gateway:ratelimit:
cab:gateway:cache:
cab:gateway:temp:
cab:booking:idempotency:
```

Không dùng key chung chung như:

```text
user:1
booking:1
trip:1
payment:1
```

vì dễ gây collision và làm mờ ownership.

---

## 10. TTL rule

Các nhóm sau bắt buộc có TTL:

```text
Rate limit keys
Gateway cache
Gateway temporary data
Booking idempotency metadata
```

Không tạo permanent Redis key cho business Aggregate.

Nếu dữ liệu phải tồn tại lâu dài và phục vụ business correctness thì dữ liệu đó phải nằm trong database của owning bounded context.

---

## 11. Security

Redis trong CAB System phải:

```text
yêu cầu password
không expose 6379 ra public network
không hard-code credential
không lưu secret plaintext không cần thiết
không lưu card number
không lưu CVV
không lưu password plaintext
```

Credential lấy từ:

```text
.env
```

Template:

```text
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME
```

`.env` thật không được commit lên GitHub.

---

## 12. Rate-limit implementation rule

Gateway rate limiter phải sử dụng Redis operation theo cách atomic hoặc transaction-safe.

Logical behavior:

```text
INCR rate-limit-key

if first request:
    set TTL = RATE_LIMIT_WINDOW_MS

if current count > RATE_LIMIT_MAX_REQUESTS:
    reject HTTP 429
```

Implementation khi làm API Gateway phải bảo đảm key không bị tồn tại vô hạn nếu process lỗi giữa:

```text
INCR
```

và:

```text
PEXPIRE
```

Do đó nên sử dụng atomic Lua script hoặc transaction-safe implementation.

Redis infrastructure milestone chỉ kiểm tra capability; actual Gateway middleware được triển khai tại API Gateway milestone.

---

## 13. Health verification

Start Redis:

```bash
docker compose up -d redis
```

Check container:

```bash
docker compose ps redis
```

Expected:

```text
cab-redis
Up
healthy
```

Nếu unhealthy:

```bash
docker compose logs redis --tail=200
```

---

## 14. Redis CLI verification

Authenticate bằng password trong `.env`.

Expected health command:

```text
PING
```

Expected response:

```text
PONG
```

Check persistence configuration:

```text
CONFIG GET appendonly
```

Expected:

```text
appendonly
yes
```

---

## 15. TTL smoke test

Create a temporary CAB infrastructure key:

```text
SET cab:infra:smoke:ttl redis-ok EX 60
```

Expected:

```text
OK
```

Read:

```text
GET cab:infra:smoke:ttl
```

Expected:

```text
redis-ok
```

Check TTL:

```text
TTL cab:infra:smoke:ttl
```

Expected:

```text
1..60
```

The key must expire automatically.

---

## 16. Rate-limit atomic smoke test

Infrastructure smoke test may use an atomic Lua command:

```lua
local current = redis.call('INCR', KEYS[1])

if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

return {
  current,
  redis.call('PTTL', KEYS[1])
}
```

This validates that Redis supports the behavior required by the future Gateway rate limiter.

---

## 17. Data inspection

Development inspection:

```text
SCAN
```

should be preferred over:

```text
KEYS *
```

for normal runtime inspection.

Do not use:

```text
FLUSHALL
FLUSHDB
```

unless intentionally resetting the local Redis environment.

---

## 18. Docker volume warning

Do not normally run:

```bash
docker compose down -v
```

because this removes named volumes for local infrastructure.

In particular, it may remove:

```text
cab_postgres_data
cab_rabbitmq_data
cab_redis_data
```

Use volume reset only when intentionally rebuilding the complete development environment.

---

## 19. Postman

Postman is not required for the Redis infrastructure-only milestone.

Redis will be verified indirectly through Postman after API Gateway and microservices are implemented.

Important Postman cases later include:

```text
Rate limit attack
-> repeated requests
-> HTTP 429

Create Booking replay
-> same Idempotency-Key
-> same Booking

Payment replay
-> same Idempotency-Key
-> same Payment
-> no additional transaction
-> no double charge
```

Client requests must continue to enter through API Gateway.

---

## 20. Source-of-truth rule

Final rule:

```text
Redis = Infrastructure / Cache / Coordination
PostgreSQL = Business Source of Truth
RabbitMQ = Business Event Transport
gRPC = Internal Synchronous IPC
API Gateway = External Entry Point
```

Do not move domain ownership into Redis.