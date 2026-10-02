# Review Events Contract

## 1. Phạm vi

Event do `review-service` phát qua RabbitMQ topic exchange `cab.events`.

Tài liệu này phải đồng bộ với `docs/api/asyncapi.yaml` và common envelope tại `contracts/events/event-envelope.md`.

---

## 2. `review.created`

### Ý nghĩa

Review hợp lệ đã được tạo cho một Trip đã hoàn thành.

### Routing

| Thuộc tính | Giá trị |
|---|---|
| Routing key | `review.created` |
| Producer | `review-service` |
| Consumers | `report-service` |

### Payload

| Field | Type | Required | Mô tả |
|---|---|---:|---|
| `reviewId` | string | Yes | ID Review. |
| `tripId` | string | Yes | Trip được đánh giá. |
| `customerId` | string | Yes | Customer tạo Review. |
| `driverId` | string | Yes | Driver được đánh giá. |
| `score` | integer 1..5 | Yes | Điểm đánh giá từ 1 đến 5. |
| `createdAt` | string (date-time) | Yes | Thời điểm Review được tạo. |

### Example

```json
{
  "eventId": "67605144-87bb-4354-8a0e-c4807467ca54",
  "eventType": "review.created",
  "occurredAt": "2026-10-02T10:40:00.000Z",
  "producer": "review-service",
  "correlationId": "req-review-001",
  "schemaVersion": 1,
  "payload": {
    "reviewId": "review-001",
    "tripId": "trip-001",
    "customerId": "customer-001",
    "driverId": "driver-001",
    "score": 5,
    "createdAt": "2026-10-02T10:40:00.000Z"
  }
}
```

## 3. Business constraints liên quan

- Review thuộc ownership của `review-service`.
- Trước khi tạo Review, `review-service` cần xác thực Trip hợp lệ/đã hoàn thành theo contract nội bộ với `trip-service`.
- `score` chỉ nhận giá trị nguyên từ `1` đến `5`.