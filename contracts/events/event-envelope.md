# Common Event Envelope

## 1. Mục đích

Tài liệu này định nghĩa **envelope dùng chung cho toàn bộ business event** của CAB System truyền qua RabbitMQ.

Nguồn contract chuẩn: `docs/api/asyncapi.yaml` (AsyncAPI 2.6.0).

## 2. RabbitMQ convention

| Thuộc tính | Giá trị |
|---|---|
| Exchange | `cab.events` |
| Exchange type | `topic` |
| Content type | `application/json` |
| Delivery style | Asynchronous event-driven |
| Consumer requirement | Consumer phải xử lý idempotent |

Các routing key chính thức:

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

## 3. Envelope schema

Mọi event phải có cấu trúc ngoài như sau:

```json
{
  "eventId": "7bb329c2-ea28-43e3-bf37-670db30114ae",
  "eventType": "booking.created",
  "occurredAt": "2026-10-02T10:15:30.000Z",
  "producer": "booking-service",
  "correlationId": "req-8a744749-1c77-4c5c-a3ff-6a13645854f0",
  "schemaVersion": 1,
  "payload": {
    "bookingId": "booking-001",
    "customerId": "customer-001",
    "vehicleTypeId": "vehicle-type-4seat",
    "createdAt": "2026-10-02T10:15:30.000Z"
  }
}
```

## 4. Field definition

| Field | Type | Required | Quy ước |
|---|---|---:|---|
| `eventId` | string (UUID) | Yes | ID duy nhất của lần phát event. Dùng để hỗ trợ deduplication/idempotency ở consumer. |
| `eventType` | string | Yes | Phải trùng với routing key/event name, ví dụ `trip.status.changed`. |
| `occurredAt` | string (date-time) | Yes | Thời điểm nghiệp vụ phát sinh event theo ISO-8601. |
| `producer` | string | Yes | Tên service phát event, ví dụ `trip-service`. |
| `correlationId` | string | Yes | ID dùng để truy vết chuỗi xử lý xuyên service. Nên giữ nguyên correlation ID từ request/event nguồn khi có. |
| `schemaVersion` | integer >= 1 | Yes | Phiên bản schema của event. Phiên bản hiện tại: `1`. |
| `payload` | object | Yes | Dữ liệu nghiệp vụ riêng của từng event. |

## 5. Quy tắc bắt buộc

1. `eventType` phải trùng với routing key đang publish.
2. `eventId` phải mới cho mỗi event được phát hợp lệ.
3. Consumer phải có cơ chế tránh xử lý lặp cùng một `eventId` gây side effect lặp.
4. `correlationId` phải được propagate khi event là một bước trong cùng business flow.
5. Không dùng ID thay thế lẫn nhau. Các định danh như `customerId`, `driverId`, `vehicleId`, `bookingId`, `tripId`, `fareId`, `paymentId`, `reviewId` giữ đúng ngữ nghĩa domain.
6. Thay đổi breaking schema phải tăng `schemaVersion` và được cập nhật đồng thời trong `docs/api/asyncapi.yaml` cùng tài liệu contract liên quan.
7. Producer không được tự ý thêm ý nghĩa nghiệp vụ trái với schema đã khóa trong AsyncAPI.

## 6. Producer hiện tại

| Event | Producer |
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