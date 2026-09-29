# CAB System – API Specifications

## Quy ước chung

- External base URL: `http://localhost:8080/api/v1`
- Mọi business request từ client đi qua **API Gateway**.
- `/health`, `/ready`, `/health/services` dùng base URL `http://localhost:8080`.
- Protected API dùng `Authorization: Bearer <JWT>`.
- Sai/chưa có token: `401 Unauthorized`.
- Token hợp lệ nhưng sai quyền: `403 Forbidden`.
- Rate limit vượt ngưỡng: `429 Too Many Requests`.
- API tạo Booking và Payment dùng `Idempotency-Key`.
- RabbitMQ event contract nằm trong `asyncapi.yaml`.

## File chính

| File | Nội dung |
|---|---|
| `health.yaml` | Liveness, readiness, trạng thái service |
| `authentication.yaml` | Customer register/login, Driver OTP + register |
| `users.yaml` | Hồ sơ user/customer |
| `drivers.yaml` | Driver profile, nearby, availability, location |
| `bookings.yaml` | Create Booking, history, driver offer, accept/reject |
| `trips.yaml` | Trip state machine, cancel, review |
| `fare.yaml` | Tính cước |
| `payments.yaml` | Payment, callback, retry, idempotency |
| `notifications.yaml` | Notification |
| `operations.yaml` | Giám sát, xử lý bất thường, Driver approval |
| `vehicles.yaml` | Vehicle |
| `authorization.yaml` | Role/permission |
| `audit.yaml` | Audit Log |
| `reports.yaml` | Báo cáo |
| `asyncapi.yaml` | RabbitMQ / asynchronous IPC |
| `rubric-api-mapping.md` | Mapping 30 tiêu chí sang API/evidence |
