# CAB System API Contracts — Demo MVP

Bộ contract này đã được rút gọn theo **SRS + DDD FINAL** và phiếu chấm 30 mục.

## Scope khóa

- Client gọi `http://localhost:8080/api` qua API Gateway; `/api/v1` còn hỗ trợ client cũ.
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

## Postman: nhập ngắn, đọc kết quả đầy đủ

Các OpenAPI YAML mô tả `/api`: body/query/path vẫn dùng alias ngắn, còn JSON business response dùng tên đầy đủ (key có khoảng trắng là JSON hợp lệ). `/api/v1` giữ tên response cũ để các script/client hiện có tiếp tục chạy; login có thêm `cid` hoặc `did` tương ứng. Token/JWT, proto và domain không đổi.

`POST http://localhost:8080/api/login`, Body → raw → JSON:

```json
{ "email": "c@c.com", "pw": "123" }
```

Ví dụ response (ID thực tế lấy từ dữ liệu đang chạy):

```json
{
  "Token": "...",
  "User ID": 13,
  "Role": "CUSTOMER",
  "Customer ID": 3
}
```

Driver nhận `Driver ID` thay cho `Customer ID`. Admin nhận `User ID`, `Role: ADMIN` và Token; hệ thống không có Admin ID riêng. Khi Account chưa có profile, ID profile trả null; Gateway không suy ra cid/did từ uid.

Trong Postman có thể đọc Token bằng `pm.response.json()["Token"]`, ví dụ lưu Customer token bằng `pm.environment.set("customerToken", pm.response.json()["Token"])` sau login thành công. Header Authorization vẫn là `Bearer <token>`.

| Alias đầu vào / tên cũ | Tên trong response `/api` |
| --- | --- |
| uid / cid / did / vid | User ID / Customer ID / Driver ID / Vehicle ID |
| bid / oid / tid / pid / rid | Booking ID / Offer ID / Trip ID / Payment ID / Review ID |
| nid / eid | Notification ID / Event ID |
| token / role / name / addr | Token / Role / Name / Address |
| ap / av | Approval Status / Availability Status |
| vt / plate | Vehicle Type / License Plate |
| lat / lng / km | Latitude / Longitude / Distance (km) |
| p / d | Pickup / Destination (tọa độ bên trong cũng dùng Latitude/Longitude) |
| s / paid / r | Status / Paid / Cancel Reason |
| amt / eligible / key | Amount / Eligible / Idempotency Key |
| star / c | Rating / Comment |
| type / ref / msg / c_at | Type / Reference / Message / Created At |
| page / limit / items | Page / Limit / Items |
| otp / tripPending | OTP / Trip Pending |
| phone / driver | Phone / Driver (thông tin tài xế được gán cho Customer sở hữu Trip) |

Ví dụ cập nhật vị trí vẫn gửi `{ "lat": 10.8232, "lng": 106.6298 }`; approval vẫn gửi `{ "ap": "APPROVED" }`; availability vẫn gửi `{ "on": true }`. Request không dùng các nhãn display. Giá trị status/role, số, boolean và null giữ nguyên. Health dùng `status: HEALTHY|UNHEALTHY`; lỗi giữ `code`, `message`, `at` và HTTP status tương ứng.

Booking và Driver đăng ký mới có thể bỏ `vt` để dùng `BIKE`; `vt=CAR` vẫn hợp lệ. Tọa độ không có giá trị mặc định. Driver bắt buộc phone, yêu cầu OTP cho đúng phone trước; mock `123` có hạn 300 giây và dùng một lần. Customer có phone tùy chọn. Biển số viết liền như `59A12345` hợp lệ. Xem ví dụ ngắn trong README gốc.

Pay lưu response đầu tiên theo key; replay trả response đó dù callback đã hoàn tất. GET Payment trả trạng thái mới nhất. Callback chỉ cho phép sau Pay hợp lệ; body chỉ gồm `s=COMPLETED`.

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
