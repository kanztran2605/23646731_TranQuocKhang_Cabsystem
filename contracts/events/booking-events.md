# Booking Events Contract

## 1. Phạm vi

Các event do `booking-service` phát qua RabbitMQ topic exchange `cab.events`.

Tài liệu này phải đồng bộ với `docs/api/asyncapi.yaml` và common envelope tại `contracts/events/event-envelope.md`.

---

## 2. `booking.created`

### Ý nghĩa

Booking hợp lệ đã được persist. Đây là dấu mốc Booking được tạo thành công và có thể tiếp tục flow matching.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `booking.created` |
| Producer | `booking-service` |
| Consumers | `notification-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `bookingId` | string | Yes | ID Booking vừa được tạo. |
| `customerId` | string | Yes | ID Customer sở hữu Booking. |
| `vehicleTypeId` | string | Yes | Loại xe Customer yêu cầu. |
| `createdAt` | string (date-time) | Yes | Thời điểm Booking được tạo. |

### Example

```json
{
  "eventId": "070f650d-c1f0-43e0-9c20-f7a9371267d3",
  "eventType": "booking.created",
  "occurredAt": "2026-10-02T10:00:00.000Z",
  "producer": "booking-service",
  "correlationId": "req-booking-001",
  "schemaVersion": 1,
  "payload": {
    "bookingId": "booking-001",
    "customerId": "customer-001",
    "vehicleTypeId": "vehicle-type-4seat",
    "createdAt": "2026-10-02T10:00:00.000Z"
  }
}
```

---

## 3. `driver.offer.created`

### Ý nghĩa

Một Driver Offer đã được tạo cho Driver trong quá trình matching Booking.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `driver.offer.created` |
| Producer | `booking-service` |
| Consumers | `notification-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `offerId` | string | Yes | ID Driver Offer. |
| `bookingId` | string | Yes | Booking liên quan. |
| `driverId` | string | Yes | Driver nhận offer. |
| `expiresAt` | string (date-time) | Yes | Thời điểm offer hết hạn. |
| `createdAt` | string (date-time) | Yes | Thời điểm offer được tạo. |

### Example

```json
{
  "eventId": "d2425012-3fc7-46b2-bf70-2bf56fda57e7",
  "eventType": "driver.offer.created",
  "occurredAt": "2026-10-02T10:00:05.000Z",
  "producer": "booking-service",
  "correlationId": "req-booking-001",
  "schemaVersion": 1,
  "payload": {
    "offerId": "offer-001",
    "bookingId": "booking-001",
    "driverId": "driver-001",
    "expiresAt": "2026-10-02T10:00:35.000Z",
    "createdAt": "2026-10-02T10:00:05.000Z"
  }
}
```

---

## 4. `booking.no_driver_found`

### Ý nghĩa

Quá trình matching kết thúc nhưng không tìm được Driver phù hợp. Booking chuyển sang terminal state `NO_DRIVER_FOUND`.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `booking.no_driver_found` |
| Producer | `booking-service` |
| Consumers | `notification-service`, `audit-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `bookingId` | string | Yes | Booking không tìm được Driver. |
| `customerId` | string | Yes | Customer sở hữu Booking. |
| `reason` | enum | Yes | `NO_SUITABLE_DRIVER` hoặc `MATCHING_TIMEOUT`. |
| `occurredAt` | string (date-time) | Yes | Thời điểm matching kết thúc. |

### Example

```json
{
  "eventId": "2764a414-f89f-40ef-8f9f-586522343b89",
  "eventType": "booking.no_driver_found",
  "occurredAt": "2026-10-02T10:01:00.000Z",
  "producer": "booking-service",
  "correlationId": "req-booking-001",
  "schemaVersion": 1,
  "payload": {
    "bookingId": "booking-001",
    "customerId": "customer-001",
    "reason": "MATCHING_TIMEOUT",
    "occurredAt": "2026-10-02T10:01:00.000Z"
  }
}
```

---

## 5. `driver.accepted`

### Ý nghĩa

Driver đã accept Driver Offer hợp lệ và Driver Assignment đã được xác nhận. `trip-service` dùng event này để tạo Trip ban đầu ở trạng thái `ASSIGNED`.

> `driver.accepted` **không chứa `tripId`** vì Trip chưa được `trip-service` tạo tại thời điểm `booking-service` phát event.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `driver.accepted` |
| Producer | `booking-service` |
| Consumers | `trip-service`, `driver-service`, `notification-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `bookingId` | string | Yes | Booking được assign. |
| `customerId` | string | Yes | Customer của Booking. |
| `driverId` | string | Yes | Driver đã accept. |
| `vehicleId` | string | Yes | Xe cụ thể được Driver sử dụng cho chuyến. |
| `vehicleTypeId` | string | Yes | Loại xe của Booking/Assignment. |
| `acceptedAt` | string (date-time) | Yes | Thời điểm Driver accept thành công. |

### Example

```json
{
  "eventId": "e3fac32c-e9c3-40fb-93f5-ff7d6d0b47f8",
  "eventType": "driver.accepted",
  "occurredAt": "2026-10-02T10:00:20.000Z",
  "producer": "booking-service",
  "correlationId": "req-booking-001",
  "schemaVersion": 1,
  "payload": {
    "bookingId": "booking-001",
    "customerId": "customer-001",
    "driverId": "driver-001",
    "vehicleId": "vehicle-001",
    "vehicleTypeId": "vehicle-type-4seat",
    "acceptedAt": "2026-10-02T10:00:20.000Z"
  }
}
```

## 6. Business constraints liên quan

- Driver chỉ được tham gia matching khi `ApprovalStatus = APPROVED` và `AvailabilityStatus = AVAILABLE`.
- Booking lifecycle của MVP: `CREATED -> SEARCHING -> ASSIGNED` hoặc `SEARCHING -> NO_DRIVER_FOUND`.
- `ASSIGNED` và `NO_DRIVER_FOUND` là terminal states của Booking; Trip lifecycle thuộc `trip-service`.