# Payment Events Contract

## 1. Phạm vi

Các event do `payment-service` phát qua RabbitMQ topic exchange `cab.events`.

Tài liệu này phải đồng bộ với `docs/api/asyncapi.yaml` và common envelope tại `contracts/events/event-envelope.md`.

Payment method chuẩn hóa trong CAB System: `CASH | ELECTRONIC`.

---

## 2. `payment.completed`

### Ý nghĩa

Payment đã hoàn thành thành công.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `payment.completed` |
| Producer | `payment-service` |
| Consumers | `notification-service`, `report-service`, `audit-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `paymentId` | string | Yes | ID Payment. |
| `fareId` | string | Yes | ID Fare liên quan. |
| `tripId` | string | Yes | ID Trip đã thanh toán. |
| `customerId` | string | Yes | Customer thực hiện thanh toán. |
| `amount` | number | Yes | Số tiền thanh toán. |
| `currency` | string | Yes | Đơn vị tiền tệ. |
| `paymentMethod` | enum | Yes | `CASH` hoặc `ELECTRONIC`. |
| `providerReference` | string hoặc `null` | No | Mã tham chiếu từ payment provider khi có. |
| `paidAt` | string (date-time) | Yes | Thời điểm Payment hoàn thành. |

### Example

```json
{
  "eventId": "10cbb98f-d729-4e62-a7cd-6f04e4c37531",
  "eventType": "payment.completed",
  "occurredAt": "2026-10-02T10:27:00.000Z",
  "producer": "payment-service",
  "correlationId": "req-payment-001",
  "schemaVersion": 1,
  "payload": {
    "paymentId": "payment-001",
    "fareId": "fare-001",
    "tripId": "trip-001",
    "customerId": "customer-001",
    "amount": 125000,
    "currency": "VND",
    "paymentMethod": "ELECTRONIC",
    "providerReference": "provider-txn-001",
    "paidAt": "2026-10-02T10:27:00.000Z"
  }
}
```

---

## 3. `payment.failed`

### Ý nghĩa

Payment đã thất bại sau khi hệ thống xử lý giao dịch.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `payment.failed` |
| Producer | `payment-service` |
| Consumers | `notification-service`, `report-service`, `audit-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `paymentId` | string | Yes | ID Payment. |
| `fareId` | string | Yes | ID Fare liên quan. |
| `tripId` | string | Yes | ID Trip liên quan. |
| `customerId` | string | Yes | Customer của Payment. |
| `amount` | number | Yes | Số tiền giao dịch. |
| `currency` | string | Yes | Đơn vị tiền tệ. |
| `failureReason` | string | Yes | Nguyên nhân Payment thất bại. |
| `providerReference` | string hoặc `null` | No | Mã tham chiếu provider khi có. |
| `failedAt` | string (date-time) | Yes | Thời điểm Payment thất bại. |

### Example

```json
{
  "eventId": "ff149a80-cf14-4e20-afef-993815537d6c",
  "eventType": "payment.failed",
  "occurredAt": "2026-10-02T10:27:00.000Z",
  "producer": "payment-service",
  "correlationId": "req-payment-002",
  "schemaVersion": 1,
  "payload": {
    "paymentId": "payment-002",
    "fareId": "fare-001",
    "tripId": "trip-001",
    "customerId": "customer-001",
    "amount": 125000,
    "currency": "VND",
    "failureReason": "PROVIDER_DECLINED",
    "providerReference": "provider-txn-002",
    "failedAt": "2026-10-02T10:27:00.000Z"
  }
}
```

## 4. Business constraints liên quan

- Payment status chuẩn hóa: `PENDING | COMPLETED | FAILED`.
- Fare chỉ được tạo/tính sau khi Trip đạt `COMPLETED`.
- Create/retry Payment phải tuân thủ idempotency để cùng một request không tạo duplicate payment hoặc double charge.
- CAB System không lưu trực tiếp thông tin nhạy cảm như card number, CVV hoặc secret của tài khoản payment provider.