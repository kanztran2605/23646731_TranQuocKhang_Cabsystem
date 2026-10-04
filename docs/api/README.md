# CAB System API Contracts — Demo MVP

Bộ contract này đã được rút gọn theo **SRS + DDD FINAL** và phiếu chấm 30 mục.

## Scope khóa

- Client chỉ gọi `http://localhost:8080/api/v1` qua API Gateway.
- Gateway → 8 business services: gRPC.
- Service-to-service gRPC chỉ giữ: Booking→Customer, Booking→Driver, Trip→Driver, Review→Trip.
- Async: RabbitMQ topic exchange `cab.events`.
- Redis chỉ thuộc Gateway.
- 7 PostgreSQL logical DB + MongoDB `notification_db`.
- Không Report/Audit service, không Fare/Pricing Engine, không external provider.

## File

- `authentication.yaml`: Register Customer, Login.
- `authorization.yaml`: RBAC policy, không có Authorization Service riêng.
- `users.yaml`: Customer Profile.
- `drivers.yaml`: Driver OTP/Register/Approval/Availability/Location/Nearby.
- `vehicles.yaml`: Vehicle Type tối thiểu.
- `bookings.yaml`: Booking/Offer/Accept.
- `trips.yaml`: Trip state/location/cancel.
- `payments.yaml`: Payment đã được tạo từ `booking.created`; pay + callback + replay.
- `notifications.yaml`: đọc notification đã consume từ RabbitMQ.
- `reviews.yaml`: Review Trip COMPLETED.
- `health.yaml`: `/health`, `/ready`, `/health/services`.
- `asyncapi.yaml`: 8 Integration Events + RabbitMQ queue/binding.

`fare.yaml` đã **xóa** vì SRS FINAL không có Fare/Pricing Engine.

## Event flow

```text
booking.created          Booking -> Payment
offer.created            Booking -> Notification
driver.accepted          Booking -> Trip
driver.approval.changed  Driver  -> Notification
trip.status.changed      Trip    -> Notification
trip.canceled            Trip    -> Driver + Notification
trip.completed           Trip    -> Driver + Payment
payment.completed        Payment -> Trip + Notification
```

## Payment lifecycle FINAL

```text
Booking persist
  -> booking.created
  -> Payment(pid, bid, tid=null, amt=50000, eligible=false, s=PENDING)
Trip COMPLETED
  -> trip.completed
  -> Payment attach tid + eligible=true
POST /payments/{pid}/pay + Idempotency-Key: P1
POST /payments/{pid}/callback {"s":"COMPLETED"}
  -> payment.completed
  -> Trip paid=true
Replay same key -> same pid, no new Payment / no double charge
```

## Demo credentials/data

```text
Customer: c@c.com / 123
Driver:   d@d.com / 123
Admin:    a@a.com / 123
OTP:      123
Payment:  amt=50000
Idempotency-Key: P1
Cancel reason: x
Review: star=5, c=ok
```
