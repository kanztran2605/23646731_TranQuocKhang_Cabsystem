# CAB System — Common Event Envelope

## RabbitMQ convention

| Property | Value |
|---|---|
| Exchange | `cab.events` |
| Type | `topic` |
| Content type | `application/json` |
| Consumer rule | Idempotent |

Canonical routing keys:

```text
booking.created
offer.created
driver.accepted
driver.approval.changed
trip.status.changed
trip.canceled
trip.completed
payment.completed
```

## Envelope

Every event uses the same small envelope:

```json
{
  "eventId": "7bb329c2-ea28-43e3-bf37-670db30114ae",
  "eventType": "booking.created",
  "occurredAt": "2026-10-04T01:00:00.000Z",
  "payload": {}
}
```

| Field | Required | Rule |
|---|---:|---|
| `eventId` | Yes | UUID unique for the published event; used for deduplication. |
| `eventType` | Yes | Must equal the RabbitMQ routing key. |
| `occurredAt` | Yes | ISO-8601 timestamp. |
| `payload` | Yes | Event-specific object defined by the event contract. |

Breaking changes require explicit approval and simultaneous update of `docs/api/asyncapi.yaml`, `contracts/events/`, producers, consumers and tests.

## Recipient identity

All five Notification-consumed events require a non-empty `recipientUserIds` array of string User IDs. Producers supply User references; consumers never infer them from Customer/Driver IDs. Each distinct recipient receives one document, deduplicated by `(eventId, uid)`, retaining the original event ID.

Recipients: Offer/approval -> Driver; normal Trip status -> Customer; cancellation -> Customer and Driver; Payment completion -> Customer. `booking.created` propagates `customerUserId`; `driver.accepted` and `trip.completed` propagate both `customerUserId` and `driverUserId`. These are logical references, not cross-database foreign keys.
