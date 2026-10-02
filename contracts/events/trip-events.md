# Trip Events Contract

## 1. Phạm vi

Các event do `trip-service` phát qua RabbitMQ topic exchange `cab.events`.

Tài liệu này phải đồng bộ với `docs/api/asyncapi.yaml` và common envelope tại `contracts/events/event-envelope.md`.

---

## 2. `trip.status.changed`

### Ý nghĩa

Trip đã chuyển trạng thái hợp lệ theo Trip State Machine.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `trip.status.changed` |
| Producer | `trip-service` |
| Consumers | `driver-service`, `notification-service`, `payment-service`, `report-service`, `audit-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `tripId` | string | Yes | ID Trip. |
| `bookingId` | string | Yes | Booking nguồn của Trip. |
| `customerId` | string | Yes | Customer của Trip. |
| `driverId` | string | Yes | Driver thực hiện Trip. |
| `vehicleId` | string | Yes | Vehicle thực hiện Trip. |
| `vehicleTypeId` | string | Yes | Loại xe của Trip. |
| `tripDistance` | number >= 0 hoặc `null` | Yes | Field luôn có mặt. Có thể `null` trước khi hoàn tất; **bắt buộc có giá trị cuối cùng khi `toStatus = COMPLETED`**. |
| `fromStatus` | string hoặc `null` | Yes | Trạng thái trước. Có thể `null` khi phát trạng thái khởi tạo `ASSIGNED`. |
| `toStatus` | enum | Yes | `ASSIGNED`, `ARRIVED`, `PICKED_UP`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`. |
| `changedAt` | string (date-time) | Yes | Thời điểm đổi trạng thái. |

### Trip State Machine

```text
ASSIGNED -> ARRIVED -> PICKED_UP -> IN_PROGRESS -> COMPLETED
```

`CANCELED` là terminal state hợp lệ theo nghiệp vụ hủy chuyến. `Abnormal Trip` không phải Trip Status riêng.

### Example - Trip vừa được tạo

```json
{
  "eventId": "6a552b60-66cb-410d-8eb2-3797cb013865",
  "eventType": "trip.status.changed",
  "occurredAt": "2026-10-02T10:00:21.000Z",
  "producer": "trip-service",
  "correlationId": "req-booking-001",
  "schemaVersion": 1,
  "payload": {
    "tripId": "trip-001",
    "bookingId": "booking-001",
    "customerId": "customer-001",
    "driverId": "driver-001",
    "vehicleId": "vehicle-001",
    "vehicleTypeId": "vehicle-type-4seat",
    "tripDistance": null,
    "fromStatus": null,
    "toStatus": "ASSIGNED",
    "changedAt": "2026-10-02T10:00:21.000Z"
  }
}
```

### Example - Trip hoàn tất

```json
{
  "eventId": "14670fc3-519f-4145-9220-d41f71b1bcc2",
  "eventType": "trip.status.changed",
  "occurredAt": "2026-10-02T10:25:00.000Z",
  "producer": "trip-service",
  "correlationId": "req-booking-001",
  "schemaVersion": 1,
  "payload": {
    "tripId": "trip-001",
    "bookingId": "booking-001",
    "customerId": "customer-001",
    "driverId": "driver-001",
    "vehicleId": "vehicle-001",
    "vehicleTypeId": "vehicle-type-4seat",
    "tripDistance": 8.4,
    "fromStatus": "IN_PROGRESS",
    "toStatus": "COMPLETED",
    "changedAt": "2026-10-02T10:25:00.000Z"
  }
}
```

### Consumer behavior quan trọng

Khi `toStatus = COMPLETED`, `payment-service` sử dụng dữ liệu Trip hoàn tất để kích hoạt Fare/Payment flow. Vì vậy `tripDistance` tại trạng thái này không được `null`.

---

## 3. `trip.canceled`

### Ý nghĩa

Trip đã bị hủy hợp lệ và chuyển sang terminal state `CANCELED`.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `trip.canceled` |
| Producer | `trip-service` |
| Consumers | `driver-service`, `notification-service`, `report-service`, `audit-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `tripId` | string | Yes | Trip bị hủy. |
| `bookingId` | string | Yes | Booking liên quan. |
| `customerId` | string | Yes | Customer của Trip. |
| `driverId` | string | Yes | Driver được assign cho Trip. |
| `reason` | string | Yes | Lý do hủy chuyến. |
| `canceledBy` | string | Yes | Chủ thể thực hiện hủy. |
| `canceledAt` | string (date-time) | Yes | Thời điểm hủy chuyến. |

### Example

```json
{
  "eventId": "37b0a2e7-bff8-4191-b3a4-c24738e62764",
  "eventType": "trip.canceled",
  "occurredAt": "2026-10-02T10:08:00.000Z",
  "producer": "trip-service",
  "correlationId": "req-booking-001",
  "schemaVersion": 1,
  "payload": {
    "tripId": "trip-001",
    "bookingId": "booking-001",
    "customerId": "customer-001",
    "driverId": "driver-001",
    "reason": "CUSTOMER_REQUEST",
    "canceledBy": "CUSTOMER",
    "canceledAt": "2026-10-02T10:08:00.000Z"
  }
}
```