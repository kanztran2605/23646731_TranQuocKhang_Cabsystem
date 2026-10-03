# Trip Events Contract

Producer: `trip-service`
Exchange: `cab.events`

## `trip.status.changed`

Consumer: `notification-service`

Payload:

```json
{
  "tripId": "1",
  "customerId": "1",
  "driverId": "1",
  "fromStatus": "ASSIGNED",
  "toStatus": "ARRIVED",
  "changedAt": "2026-10-04T01:10:00.000Z"
}
```

Valid lifecycle:

```text
ASSIGNED -> ARRIVED -> IN_PROGRESS -> COMPLETED
```

`CANCELED` is handled by the dedicated `trip.canceled` event.

## `trip.canceled`

Consumers: `driver-service`, `notification-service`

Payload:

```json
{
  "tripId": "2",
  "customerId": "1",
  "driverId": "1",
  "reason": "x",
  "canceledAt": "2026-10-04T01:12:00.000Z"
}
```

Driver consumer returns the Driver to `AVAILABLE` when appropriate.

## `trip.completed`

Consumers: `driver-service`, `payment-service`

Payload:

```json
{
  "tripId": "1",
  "bookingId": "6",
  "customerId": "1",
  "driverId": "1",
  "completedAt": "2026-10-04T01:20:00.000Z"
}
```

Rules:

- Driver consumer releases the Driver from `BUSY` to `AVAILABLE` when appropriate;
- Payment consumer finds the existing Payment by `bookingId`, attaches `tripId`, and sets `eligible=true`;
- this event never creates a new Payment.
