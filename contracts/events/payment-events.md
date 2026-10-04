# Payment Events Contract

Producer: `payment-service`
Exchange: `cab.events`

## `payment.completed`

Consumers: `trip-service`, `notification-service`

Payload:

```json
{
  "recipientUserIds": ["13"],
  "paymentId": "1",
  "bookingId": "6",
  "tripId": "1",
  "customerId": "1",
  "amount": 50000,
  "paidAt": "2026-10-04T01:25:00.000Z"
}
```

Rules:

- emitted only when an existing Payment changes from `PENDING` to `COMPLETED` through the demo callback;
- Payment must already be `eligible=true`;
- Trip consumer sets `paid=true` idempotently;
- Notification consumer stores the result in MongoDB;
