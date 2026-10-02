# CAB System RabbitMQ Infrastructure

## 1. Purpose

RabbitMQ là asynchronous message broker của CAB System.

RabbitMQ được sử dụng cho các business event không yêu cầu phản hồi đồng bộ trực tiếp giữa các bounded context.

Nguồn contract chính thức:

- `docs/api/asyncapi.yaml`
- `contracts/events/event-envelope.md`
- `contracts/events/booking-events.md`
- `contracts/events/trip-events.md`
- `contracts/events/payment-events.md`
- `contracts/events/review-events.md`

Không tự tạo event name hoặc payload ngoài các contract trên.

---

## 2. Architecture rule

CAB System sử dụng:

```text
Client
  |
  | REST / HTTPS / JSON
  v
API Gateway
  |
  | gRPC synchronous IPC
  v
Microservices
  |
  | RabbitMQ asynchronous events
  v
Other Microservices
```

RabbitMQ không thay thế gRPC cho synchronous IPC.

RabbitMQ được dùng khi producer phát business event và không cần nhận business response trực tiếp từ consumer.

---

## 3. Broker

Docker service:

```text
rabbitmq
```

Container:

```text
cab-rabbitmq
```

AMQP endpoint bên trong Docker network:

```text
rabbitmq:5672
```

Management UI:

```text
http://localhost:15672
```

Credentials được lấy từ `.env`:

```text
RABBITMQ_USER
RABBITMQ_PASSWORD
```

Không hard-code credential vào source code hoặc `definitions.json`.

---

## 4. Exchange

Exchange chính thức:

```text
cab.events
```

Type:

```text
topic
```

Properties:

```text
durable = true
auto_delete = false
internal = false
```

Chỉ có một business-event exchange được định nghĩa cho MVP:

```text
cab.events
```

---

## 5. Official routing keys

CAB System có đúng 9 business routing keys:

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

Không tự tạo thêm business routing key khi chưa cập nhật đồng thời:

1. DDD/SRS nếu nghiệp vụ thay đổi.
2. `docs/api/asyncapi.yaml`.
3. `contracts/events/`.
4. Producer/consumer implementation.

---

## 6. Event envelope

Mọi event phải tuân theo common envelope:

```json
{
  "eventId": "uuid",
  "eventType": "driver.accepted",
  "occurredAt": "2026-10-02T10:00:00.000Z",
  "producer": "booking-service",
  "correlationId": "request-or-flow-id",
  "schemaVersion": 1,
  "payload": {}
}
```

Required fields:

```text
eventId
eventType
occurredAt
producer
correlationId
schemaVersion
payload
```

`eventType` phải trùng routing key.

---

## 7. Consumer queues

CAB System sử dụng một durable queue riêng cho mỗi consumer service cần nhận business events.

### trip-service

Queue:

```text
cab.trip-service.events
```

Bindings:

```text
driver.accepted
```

`trip-service` consume `driver.accepted` để tạo Trip ban đầu ở trạng thái `ASSIGNED`.

`driver.accepted` không chứa `tripId`.

---

### driver-service

Queue:

```text
cab.driver-service.events
```

Bindings:

```text
driver.accepted
trip.status.changed
trip.canceled
```

---

### notification-service

Queue:

```text
cab.notification-service.events
```

Bindings:

```text
booking.created
driver.offer.created
booking.no_driver_found
driver.accepted
trip.status.changed
trip.canceled
payment.completed
payment.failed
```

Notification Service tạo notification từ business event; producer không gọi Notification Service synchronously để gửi notification.

---

### payment-service

Queue:

```text
cab.payment-service.events
```

Bindings:

```text
trip.status.changed
```

Payment Service chỉ kích hoạt Fare/Payment business flow khi:

```text
event.payload.toStatus = COMPLETED
```

Khi `toStatus = COMPLETED`:

```text
event.payload.tripDistance
```

phải có final value và không được `null`.

Không tạo RPC `CalculateFare` từ Trip Service sang Payment Service.

---

### report-service

Queue:

```text
cab.report-service.events
```

Bindings:

```text
trip.status.changed
trip.canceled
payment.completed
payment.failed
review.created
```

Report Service xây reporting read model từ event.

Report Service không đọc trực tiếp database của Trip, Payment hoặc Review Service.

---

### audit-service

Queue:

```text
cab.audit-service.events
```

Bindings:

```text
booking.no_driver_found
trip.status.changed
trip.canceled
payment.completed
payment.failed
```

Audit Service lưu audit record cho các critical business events thuộc contract.

---

## 8. Queue properties

Tất cả consumer queue trong `definitions.json`:

```text
durable = true
auto_delete = false
```

Mỗi service có queue riêng để các consumer nhận độc lập cùng một event.

Ví dụ:

```text
driver.accepted
       |
       v
   cab.events
       |
       +--> cab.trip-service.events
       |
       +--> cab.driver-service.events
       |
       +--> cab.notification-service.events
```

Một queue dùng chung cho nhiều service là không đúng topology của CAB System vì message sẽ bị competing consumer thay vì mỗi bounded context nhận bản event riêng.

---

## 9. Consumer idempotency

AsyncAPI yêu cầu consumer phải idempotent.

Mỗi event có:

```text
eventId
```

Consumer phải tránh tạo side effect lần hai nếu cùng một `eventId` được delivery lại.

Shared consumer helper tại:

```text
shared/rabbitmq/consumer.js
```

buộc service phải khai báo chiến lược idempotency trước khi consume.

Idempotency storage thuộc database/domain của service tương ứng; không tạo shared business database cho RabbitMQ.

---

## 10. Publisher rules

Shared publisher:

```text
shared/rabbitmq/publisher.js
```

Producer ownership:

| Routing key | Producer |
|---|---|
| `booking.created` | `booking-service` |
| `driver.offer.created` | `booking-service` |
| `booking.no_driver_found` | `booking-service` |
| `driver.accepted` | `booking-service` |
| `trip.status.changed` | `trip-service` |
| `trip.canceled` | `trip-service` |
| `payment.completed` | `payment-service` |
| `payment.failed` | `payment-service` |
| `review.created` | `review-service` |

Một service không được publish event thuộc ownership của service khác.

---

## 11. Import topology for local development

Start RabbitMQ:

```bash
docker compose up -d rabbitmq
```

Check status:

```bash
docker compose ps rabbitmq
```

Copy definitions into the running container:

```bash
docker cp infrastructure/rabbitmq/definitions.json cab-rabbitmq:/tmp/cab-definitions.json
```

Import:

```bash
docker compose exec rabbitmq rabbitmqctl import_definitions /tmp/cab-definitions.json
```

Expected topology:

```text
1 topic exchange
6 durable consumer queues
23 exact bindings
9 unique business routing keys
```

---

## 12. Verify with CLI

Exchanges:

```bash
docker compose exec rabbitmq rabbitmqctl list_exchanges name type durable
```

Expected:

```text
cab.events    topic    true
```

Queues:

```bash
docker compose exec rabbitmq rabbitmqctl list_queues name durable messages consumers
```

Expected CAB queues:

```text
cab.trip-service.events
cab.driver-service.events
cab.notification-service.events
cab.payment-service.events
cab.report-service.events
cab.audit-service.events
```

Bindings:

```bash
docker compose exec rabbitmq rabbitmqctl list_bindings source_name destination_name destination_kind routing_key
```

Verify that all bindings originate from:

```text
cab.events
```

and correspond to the 9 routing keys defined in AsyncAPI.

---

## 13. Verify with Management UI

Open:

```text
http://localhost:15672
```

Login using:

```text
RABBITMQ_USER
RABBITMQ_PASSWORD
```

Check:

```text
Exchanges
  -> cab.events
```

The exchange must show:

```text
Type = topic
Durable = true
```

Then open:

```text
Queues and Streams
```

Verify all 6 CAB consumer queues exist and are durable.

---

## 14. Manual event routing smoke test

For infrastructure-only verification, publish a test event from RabbitMQ Management UI.

Open:

```text
Exchanges
-> cab.events
-> Publish message
```

Routing key:

```text
driver.accepted
```

Payload:

```json
{
  "eventId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "eventType": "driver.accepted",
  "occurredAt": "2026-10-02T10:00:00.000Z",
  "producer": "booking-service",
  "correlationId": "rabbitmq-infrastructure-test",
  "schemaVersion": 1,
  "payload": {
    "bookingId": "booking-test",
    "customerId": "customer-test",
    "driverId": "driver-test",
    "vehicleId": "vehicle-test",
    "vehicleTypeId": "vehicle-type-test",
    "acceptedAt": "2026-10-02T10:00:00.000Z"
  }
}
```

Expected routing:

```text
cab.trip-service.events
cab.driver-service.events
cab.notification-service.events
```

Each queue should receive one Ready message when the real services are not running.

This confirms that topic routing is working.

After testing, purge the three test queues before running the real application.

---

## 15. Docker note

Do not run:

```bash
docker compose down -v
```

during ordinary RabbitMQ verification because `-v` removes named Docker volumes, including previously initialized local infrastructure data.

Only reset volumes intentionally when rebuilding the complete local environment from scratch.

---

## 16. Postman note

Postman is not required for the RabbitMQ infrastructure-only milestone.

Postman becomes relevant after:

```text
API Gateway
+ corresponding Microservices
+ PostgreSQL
+ RabbitMQ
+ Redis
```

are running together.

At that point the RabbitMQ flow is verified indirectly through business API flows such as:

```text
Create Booking
Driver Accept
Trip Status Change
Cancel Trip
Payment
Review
```

Client business requests must still enter through API Gateway.