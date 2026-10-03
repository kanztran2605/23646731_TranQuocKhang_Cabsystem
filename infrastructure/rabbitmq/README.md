# RabbitMQ — CAB System MVP

Exchange: `cab.events` (`topic`, durable).

Queues / bindings:

| Queue | Routing keys |
|---|---|
| `cab.payment.q` | `booking.created`, `trip.completed` |
| `cab.trip.q` | `driver.accepted`, `payment.completed` |
| `cab.driver.q` | `trip.canceled`, `trip.completed` |
| `cab.notification.q` | `offer.created`, `driver.approval.changed`, `trip.status.changed`, `trip.canceled`, `payment.completed` |

Canonical events are documented in `contracts/events/` and `docs/api/asyncapi.yaml`.

Consumer side effects must be idempotent. The topology contains only the four queues and eight routing keys listed above.
