# Nghiệm thu điều chỉnh demo MSA — 27/10/2026

## Những điểm đã sửa

- Booking và đăng ký Driver mặc định BIKE khi bỏ `vt`; vẫn chấp nhận CAR, từ chối loại khác. Tọa độ vẫn bắt buộc, không thay đổi PostGIS/matching/phân trang.
- Biển số viết liền hợp lệ, được chuẩn hóa chữ hoa; unique index bảo vệ cả khác biệt chữ hoa/thường của biển số cũ.
- Customer có phone Việt Nam tùy chọn. Chỉ chính Customer thấy phone trong hồ sơ; lookup nội bộ cho Booking và response Admin không chứa phone.
- Driver bắt buộc phone duy nhất. OTP mock 123 gắn phone, hạn 300 giây, lưu ở driver_db. OTP sai/hết hạn dừng trước Auth. OTP xác thực một lần; gửi lại cùng hồ sơ dùng cùng mã đăng ký để hoàn tất các RPC bị gián đoạn.
- Gateway điều phối PrepareDriverRegistration → Auth CreateAccount INACTIVE → RegisterDriver → CompleteDriverRegistration ACTIVE. Không tạo thêm cạnh gRPC giữa business services. Account chưa đủ hồ sơ không đăng nhập được; retry không tạo Account/Driver thứ hai.
- Customer sở hữu Trip thấy Driver ID, tên, loại xe và biển số trong `Driver`. Trip kiểm tra ownership rồi dùng cạnh Trip → Driver hiện có; không mở quyền Driver Admin và không trả phone/giấy phép.
- Callback chỉ hoàn tất sau Pay hợp lệ đã lưu key/request/response. Body callback chỉ nhận `s=COMPLETED`. Payment lưu response Pay đầu tiên trong PostgreSQL, replay trả đúng response đó kể cả sau callback; GET trả trạng thái hiện tại. Cùng key khác amount bị từ chối.
- Giữ nguyên Trip state/location, cancel, review, event payload/routing keys, rate limit và cơ chế mã hóa giấy phép.

## Test đã thực sự chạy

| Suite | Unit/gRPC PASS | DB integration PASS | FAIL cuối |
| --- | ---: | ---: | ---: |
| Auth | 14 | 4 | 0 |
| Customer | 9 | 2 | 0 |
| Driver | 23 | 4 | 0 |
| Booking | 47 | 3 | 0 |
| Trip | 23 | 2 | 0 |
| Payment | 19 | 2 | 0 |
| Notification | 13 | 1 | 0 |
| Review | 12 | 1 | 0 |
| Gateway | 86 | — | 0 |
| Shared | 11 | — | 0 |
| **Tổng** | **257** | **19** | **0** |

`npm test` đã chạy hết runner, không bỏ suite. DB integration bổ sung kiểm tra OTP hết hạn/gắn phone/dùng lại, retry đăng ký, phone/plate trùng, Account INACTIVE và 10 Pay đồng thời + callback đồng thời chỉ hoàn tất/phát event một lần. Các lỗi ban đầu từ test fixture cũ và so sánh thứ tự key JSONB đã sửa, sau đó chạy lại đạt bảng trên.

- Smoke chính: **31/31 kiểm tra**, **30/30 tiêu chí**, run `58ff5d113dbe`, qua `/api` thật. Booking/Driver không nhập vt dùng BIKE; Customer phone; thông tin Driver đúng chủ Trip; Payment tạo ngay từ booking.created; một Offer/Assignment/Trip; state/location; Pay/callback/replay; Cancel hai người nhận; Review/XSS; SQLi; JWT; RBAC; Redis 200/200/200/429; redelivery cả 8 event.
- Smoke bổ sung: OTP hết hạn qua Gateway không tạo Account/Profile; retry đăng ký cùng UID/DID; phone trùng bị từ chối; CAR tường minh đi qua Booking → Offer → Accept → Trip → Cancel. Driver test kết thúc OFFLINE.
- Replay **P1 thật** của Payment 9: hai response giống nhau, cùng pid, trả snapshot Pay PENDING; GET vẫn COMPLETED; hash row không đổi. Không chiếm lại P1 hoặc sửa Payment cũ để làm test.
- 13/13 Compose component running/healthy; `/health`, `/ready`, `/health/services` HTTP 200; 8/8 business services HEALTHY.
- 149 file JS qua `node --check`; 9 helper Python qua AST parse; 12 API YAML qua parser; `git diff --check`, Compose config và legacy scans PASS.
- Sheet `30 Rubric Smoke Test Cases` đã được đọc lại; không sửa workbook.

## Migration và bảo toàn dữ liệu

`scripts/migrate-demo-rubric.py` mặc định chỉ kiểm tra trùng. `--apply` phải backup đủ auth_db/customer_db/driver_db/booking_db/payment_db trước khi áp dụng SQL bổ sung; không drop/rename/xóa bảng, database hoặc volume.

Volume local có bảng thuộc `cab_user`, runtime dùng `cab`. Backup bằng `cab` không đọc được schema lưu trữ cũ `legacy_final` của payment_db; ALTER bằng `cab` cũng thiếu quyền sở hữu bảng. Đã xác minh `cab_user` là superuser/chủ bảng, backup toàn bộ bằng tài khoản này rồi migration bằng đúng chủ bảng. Không đổi quyền sở hữu bảng cũ; bảng OTP mới được cấp quyền cho tài khoản runtime.

Lệnh áp dụng trên volume local này:

```powershell
python scripts/migrate-demo-rubric.py
python scripts/migrate-demo-rubric.py --apply --backup-user cab_user --schema-user cab_user
python scripts/ensure-bike-demo.py
```

Đã chạy migration và helper hai lần: PASS. Backup riêng tư dưới `.backups/rubric-migration-*`, không đưa vào Git. Đối chiếu hash trên **25 bảng**, chỉ các cột có trước migration: toàn bộ dòng cũ vẫn còn nguyên. Không chạy lại init/seed trên volume đã có dữ liệu.

Thêm Driver BIKE demo riêng **did=52**, tài khoản `bike@cab.demo / 123`, APPROVED/AVAILABLE tại 10.76,106.68. Giữ nguyên các Driver CAR cũ. Fresh seed có BIKE riêng; helper chỉ tạo/cập nhật đúng hồ sơ demo đã nhận diện và từ chối đổi hồ sơ lạ/BUSY/REJECTED.

Chỉ cập nhật 7 app container bằng `up -d --no-deps` sau build/migration. RabbitMQ không recreate, không đổi node/hostname/Mnesia/network; container hiện tại được tạo lúc 03:04 UTC, trước đợt cập nhật app. Không sửa `.env` thật; `.env` và `.backups` vẫn ignored.

## File thuộc đợt điều chỉnh này

Các thay đổi `/api`, nhãn JSON và cấu hình RabbitMQ đang có từ trước được giữ nguyên; không coi toàn bộ working tree là thay đổi mới của đợt này.

| Nhóm | File sửa/thêm |
| --- | --- |
| Shared | `shared/demo-input.js` (mới), `shared/logging/logger.js`, `shared/tests/demo-input.test.js` (mới), `shared/tests/infrastructure.test.js` |
| Proto | `proto/auth.proto`, `proto/customer.proto`, `proto/driver.proto`, `proto/payment.proto`, `proto/trip.proto` |
| Gateway | `services/api-gateway/src/routes/auth.routes.js`, `driver.routes.js`, `payment.routes.js`, `responses.js`, `transport.js`; `src/middleware/presentation.middleware.js` (bổ sung nhãn Phone/Driver vào file đã có); `tests/gateway.test.js` |
| Auth | `services/auth-service/src/grpc/auth.grpc.js`, `src/repositories/user.repository.js`, `src/services/auth.service.js`, `tests/auth.test.js`, `tests/database.integration.js` |
| Customer | `services/customer-service/src/domain/customer-profile.js`, `src/repositories/customer.repository.js`, `src/services/customer.service.js`, `tests/customer.test.js`, `tests/database.integration.js` |
| Driver | `services/driver-service/src/grpc/driver.grpc.js`, `src/repositories/driver.repository.js`, `src/services/driver.service.js`, `tests/driver.test.js`, `tests/database.integration.js` |
| Booking | `services/booking-service/src/services/booking.service.js`, `tests/booking.grpc.test.js`, `tests/booking.service.test.js` |
| Trip | `services/trip-service/src/grpc/driver.client.js`, `src/services/trip.service.js`, `tests/fixture.js`, `tests/trip.test.js` |
| Payment | `services/payment-service/src/repositories/payment.repository.js`, `src/services/payment.service.js`, `tests/fixture.js`, `tests/payment.test.js`, `tests/database.integration.js` |
| Review | `services/review-service/tests/review.test.js` (chỉ thêm test văn bản hợp lệ, không sửa business logic) |
| Cấu hình/schema | `.env.example`, `infrastructure/postgres/init.sql`, `seed.sql`, `migrations/20261027_demo_rubric.sql` (mới) |
| Helper | `scripts/migrate-demo-rubric.py`, `scripts/ensure-bike-demo.py` (mới), `scripts/smoke-local-full.py` |
| Tài liệu | `README.md`, `AI_CONTEXT.md`, `docs/requirements/SRS.md`, `docs/api/README.md`, `authentication.yaml`, `users.yaml`, `drivers.yaml`, `bookings.yaml`, `trips.yaml`, `payments.yaml`, báo cáo này và ghi chú kết quả mới trong `FINAL_IMPLEMENTATION_VALIDATION.md` |

## Lệnh nghiệm thu

```powershell
npm test
# DB integration: copy tests vào app container nếu image không chứa tests, rồi:
docker exec cab-driver-service node --test tests/database.integration.js
# Tương tự auth/customer/booking/trip/payment/notification/review.
python scripts/smoke-local-full.py --idempotency-key RUBRIC-<key-moi>
docker compose config --quiet
docker compose config --services
docker compose ps
git diff --check
```

Đã giữ kiến trúc 8 business services, 4 cạnh domain gRPC và 8 routing keys. Không còn blocker so với yêu cầu điều chỉnh. Các record test mới được giữ để kiểm tra; dữ liệu cũ không bị xóa. Working tree chưa commit trong đợt này.
