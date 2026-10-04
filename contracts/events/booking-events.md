# Booking Events Contract

Producer: `booking-service`
Exchange: `cab.events`

## `booking.created`

Consumer: `payment-service`

Payload:

```json
{
  "customerUserId": "13",
  "bookingId": "6",
  "customerId": "1",
  "createdAt": "2026-10-04T01:00:00.000Z"
}
```

Rules:

- emitted only after Booking is persisted;
- Payment consumer creates exactly one Payment for `bookingId`;
- duplicate delivery must not create a second Payment.

## `offer.created`

Consumer: `notification-service`

Payload:

```json
{
  "recipientUserIds": ["14"],
  "offerId": "1",
  "bookingId": "6",
  "driverId": "1",
  "createdAt": "2026-10-04T01:00:01.000Z"
}
```

MVP has no offer expiration/timeout/retry workflow.

## `driver.accepted`

Consumer: `trip-service`

Payload:

```json
{
  "customerUserId": "13",
  "driverUserId": "14",
  "bookingId": "6",
  "customerId": "1",
  "driverId": "1",
  "vehicleId": "1",
  "acceptedAt": "2026-10-04T01:00:05.000Z"
}
```

Rules:

- no `tripId` because Trip does not exist yet;
- duplicate delivery must not create a second Trip for the same Booking.
