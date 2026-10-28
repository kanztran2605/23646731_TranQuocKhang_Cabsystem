# Demo 5 Driver và alias Trip Status — 28/10/2026

## Phạm vi

- Chỉ bổ sung alias đầu vào REST tại Gateway: `A`, `I_G`, `C`.
- Giữ nguyên enum Proto, database, state machine, matching và 8 RabbitMQ routing key.
- Chuẩn bị 5 tài khoản bằng script quản trị **local**, không bỏ qua OTP/approval trong API đăng ký thông thường.
- Không thay đổi schema/migration, xóa dữ liệu hay reset/recreate volume. Không sửa Driver 52.
- Không commit/push. `output/` là PDF đã tồn tại từ công việc trước, không thuộc thay đổi lần này.

## Dữ liệu thực tế

Mật khẩu của đúng 5 tài khoản demo: `123`, lưu bằng bcrypt của Auth với số vòng từ ENV.
Các ID dưới đây là kết quả database tự cấp trên máy hiện tại, không phải ID cố định trong code.

| Email | UID | DID | VID | Tên | Phone | Approval | Availability | Xe | Biển số | lat | lng |
|---|---:|---:|---:|---|---|---|---|---|---|---:|---:|
| t1@d.com | 56 | 68 | 68 | Nguyen Van An | 0900000101 | APPROVED | AVAILABLE | BIKE | 59A10001 | 10.8000 | 106.7200 |
| t2@d.com | 59 | 69 | 69 | Tran Van Binh | 0900000102 | APPROVED | BUSY | CAR | 59B10002 | 10.8007 | 106.7203 |
| t3@d.com | 60 | 70 | 70 | Le Van Cuong | 0900000103 | APPROVED | OFFLINE | CAR | 59C10003 | 10.8014 | 106.7206 |
| t4@d.com | 61 | 71 | 71 | Pham Van Dung | 0900000104 | PENDING_APPROVAL | OFFLINE | BIKE | 59D10004 | 10.8021 | 106.7209 |
| t5@d.com | 62 | 72 | 72 | Vo Van Em | 0900000105 | REJECTED | OFFLINE | BIKE | 59E10005 | 10.8028 | 106.7212 |

t2 BUSY có **Booking 62 → Assignment → Trip 2744230 ASSIGNED** thực tế. Script tạo một Booking CAR mới bằng Customer demo rồi để chính t2 Accept qua Gateway; không INSERT Trip giả, không gán BUSY trực tiếp. Payment/Notification mới phát sinh theo event bình thường; không sửa Booking/Payment/Notification đã có trước đó.

Script kiểm tra xung đột email/phone/plate, hồ sơ, Trip và assignment chưa được consume trước khi ghi. Tài khoản mới giữ INACTIVE cho đến khi Profile/Vehicle/Application/Location lưu thành công. DriverApplication đã duyệt có người duyệt và thời điểm duyệt theo ràng buộc của volume PostgreSQL cũ. Không cần license plaintext để tạo fixture.

## Chuẩn bị lại — Git Bash trên Windows

```bash
# Chỉ kiểm tra, chưa ghi dữ liệu:
python scripts/prepare-demo-drivers.py

# Máy hiện tại: superuser cũ đã xác minh là cab_user; không phải mật khẩu.
python scripts/prepare-demo-drivers.py --apply --backup-user cab_user

# Database mới có runtime user là owner và đủ quyền backup:
# python scripts/prepare-demo-drivers.py --apply
```

Script backup 5 PostgreSQL DB liên quan bằng pg_dump vào `.backups/demo-drivers-*/` đã gitignore trước khi ghi. Backup lỗi thì dừng. Không sửa `.env`, không chạy migration. Có thể dùng `py` thay `python` nếu máy cài Python Launcher.

Chạy lại tái sử dụng UID/DID/VID; nếu t2 đã có một Trip mở thì giữ nguyên Trip đó, không tạo thêm. Không chạy seed đồng thời với người đang demo. Nếu t1 còn Trip mở, script dừng để tránh cưỡng ép BUSY thành AVAILABLE. Nếu Driver khác chen vào page 1 hoặc được matching ưu tiên hơn, script báo lỗi, không di chuyển hoặc đổi trạng thái Driver ngoài nhóm.

### Khi t1 đang BUSY

1. Dùng Customer đã tạo Booking đó: `GET /api/trips/by-booking/<bid>`.
2. Hoàn tất đúng thứ tự bằng token t1, hoặc Customer hủy Trip chưa kết thúc bằng `POST /api/trips/<tid>/cancel`, body `{"r":"x"}`.
3. Chờ event `trip.completed`/`trip.canceled` đưa t1 về AVAILABLE; không UPDATE availability trực tiếp trong DB.
4. Chạy lại script chuẩn bị nếu cần. Không tác động Trip BUSY của t2 khi đang dùng nó để minh chứng Nearby.

## Postman trắng — thao tác ngắn

Không cần Collection, Environment hay script. Body chọn raw/JSON; các request có quyền chọn Authorization → Bearer Token và dán đúng token. Nếu HTTP 429, chờ `Retry-After` hoặc 11 giây.

### Nearby — token Admin

`POST http://localhost:8080/api/login`

```json
{"email":"a@a.com","pw":"123"}
```

`GET http://localhost:8080/api/drivers/nearby?lat=10.80&lng=106.72&r=1&page=1&limit=5`

Nearby hiện cho ADMIN xem cả 5 tổ hợp. Không mở quyền cho Customer và không sửa bộ lọc. Khoảng cách được tính bởi PostGIS từ tọa độ thực tế, sắp `distance_km,did`.

JSON thực tế sau nghiệm thu (không có token/phone trong Nearby):

```json
{
  "Page": 1,
  "Limit": 5,
  "Items": [
    {
      "Driver ID": 68,
      "User ID": 56,
      "Name": "Nguyen Van An",
      "Approval Status": "APPROVED",
      "Availability Status": "AVAILABLE",
      "Vehicle ID": 68,
      "Vehicle Type": "BIKE",
      "License Plate": "59A10001",
      "Latitude": 10.8,
      "Longitude": 106.72,
      "Distance (km)": 0
    },
    {
      "Driver ID": 69,
      "User ID": 59,
      "Name": "Tran Van Binh",
      "Approval Status": "APPROVED",
      "Availability Status": "BUSY",
      "Vehicle ID": 69,
      "Vehicle Type": "CAR",
      "License Plate": "59B10002",
      "Latitude": 10.8007,
      "Longitude": 106.7203,
      "Distance (km)": 0.08409321619
    },
    {
      "Driver ID": 70,
      "User ID": 60,
      "Name": "Le Van Cuong",
      "Approval Status": "APPROVED",
      "Availability Status": "OFFLINE",
      "Vehicle ID": 70,
      "Vehicle Type": "CAR",
      "License Plate": "59C10003",
      "Latitude": 10.8014,
      "Longitude": 106.7206,
      "Distance (km)": 0.16818640596
    },
    {
      "Driver ID": 71,
      "User ID": 61,
      "Name": "Pham Van Dung",
      "Approval Status": "PENDING_APPROVAL",
      "Availability Status": "OFFLINE",
      "Vehicle ID": 71,
      "Vehicle Type": "BIKE",
      "License Plate": "59D10004",
      "Latitude": 10.8021,
      "Longitude": 106.7209,
      "Distance (km)": 0.25227956932
    },
    {
      "Driver ID": 72,
      "User ID": 62,
      "Name": "Vo Van Em",
      "Approval Status": "REJECTED",
      "Availability Status": "OFFLINE",
      "Vehicle ID": 72,
      "Vehicle Type": "BIKE",
      "License Plate": "59E10005",
      "Latitude": 10.8028,
      "Longitude": 106.7212,
      "Distance (km)": 0.33637270624000004
    }
  ]
}
```

### Booking và Accept

Đăng nhập Customer `c@c.com / 123`, dùng token Customer:

`POST http://localhost:8080/api/bookings`

```json
{"p":{"lat":10.80,"lng":106.72},"d":{"lat":10.81,"lng":106.73}}
```

Không truyền `vt` → BIKE. t1 cách pickup 0 km và là ứng viên hợp lệ gần nhất. Response ban đầu `Status=SEARCHING`, `Driver ID=68`; ghi lại **Booking ID** và **Offer ID** từ response, không dùng ID cũ.

Đăng nhập t1:

```json
{"email":"t1@d.com","pw":"123"}
```

Dùng token t1:

- `GET http://localhost:8080/api/drivers/me/offers`
- `POST http://localhost:8080/api/offers/<oid>/accept` — không cần body.

Chỉ sau Accept Booking mới ASSIGNED và Trip được tạo async. Dùng token Customer sở hữu Booking:

`GET http://localhost:8080/api/trips/by-booking/<bid>`

Phần `Driver` trả Driver ID, Name, Vehicle Type, License Plate của t1. Customer khác nhận 403.

### Trip Status — token t1 sở hữu Trip

`PATCH http://localhost:8080/api/trips/<tid>/status`

| Thứ tự | Body ngắn | Response `Status` |
|---|---|---|
| 1 | `{"s":"A"}` | ARRIVED |
| 2 | `{"s":"I_G"}` | IN_PROGRESS |
| 3 | `{"s":"C"}` | COMPLETED |

Giữa bước 2 và 3: `PATCH /api/trips/<tid>/location`, body `{"lat":10.805,"lng":106.725}`. Tọa độ vẫn nhập thủ công.

Các giá trị đầy đủ ARRIVED/IN_PROGRESS/COMPLETED vẫn dùng được. `C` không phải CANCELED; hủy dùng API riêng. `X` trả 400; ASSIGNED → C trả 400 theo state machine hiện hành; Trip terminal đổi tiếp trả 409; Driver khác trả 403; thiếu JWT trả 401. Response, DB, history và event chỉ dùng tên chuẩn.

## Kết quả nghiệm thu

Các kết quả sau đã chạy thực tế trong milestone này, không chỉ kế thừa báo cáo cũ.

| Kiểm tra | PASS | FAIL | Bằng chứng |
|---|---:|---:|---|
| Auth unit/gRPC | 14 | 0 | `.backups/demo-root-tests.log` |
| Customer unit/gRPC | 9 | 0 | cùng root log |
| Driver unit/gRPC | 23 | 0 | cùng root log |
| Booking unit/gRPC | 47 | 0 | cùng root log |
| Trip unit/gRPC | 23 | 0 | cùng root log |
| Payment unit/gRPC | 19 | 0 | cùng root log |
| Notification unit/gRPC | 13 | 0 | cùng root log |
| Review unit/gRPC | 12 | 0 | cùng root log |
| Gateway unit/gRPC | 93 | 0 | cùng root log; tăng 7 test alias |
| Shared | 11 | 0 | cùng root log |
| **Root npm test** | **264** | **0** | runner hoàn tất, exit 0 |
| Driver DB integration | 4 | 0 | `.backups/demo-driver-db.log` |
| Booking DB integration | 3 | 0 | `.backups/demo-booking-db.log` |
| Trip DB integration | 2 | 0 | `.backups/demo-trip-db.log` |
| Smoke riêng 5 Driver/alias | 7 nhóm | 0 | run `ccc710d56e` |
| Full E2E hiện có | 31 checks | 0 | run `18394e0d9f00`, 30/30 rubric |

DB integration lần này chạy **9 test liên quan**; không tuyên bố chạy lại toàn bộ 19 DB tests. Gateway cũng được chạy riêng đạt 93/93. Đã kiểm tra cú pháp 147 file JS trong services/shared và AST hai helper Python. Compose config, đúng 13 component, runtime legacy scan và `git diff --check` đều PASS.

### Bằng chứng trên stack thật

- Snapshot cuối: `.backups/demo-drivers-final.json`; Nearby khớp từng DID/UID/VID/name/status/vehicle/plate/lat/lng trong PostgreSQL. Khoảng cách 0 / 0.08409321619 / 0.16818640596 / 0.25227956932 / 0.33637270624 km.
- Seed chạy lại thành công: cùng UID/DID/VID, email/phone/plate và cùng Trip `2744230` của t2; không thêm Account/Profile/Vehicle/Trip trùng. Kết quả hai lần nằm trong `.backups/demo-drivers-*/result.json`.
- Đã thử chế độ chỉ kiểm tra khi t1 còn Trip mở: script exit 1 có chủ đích, thông báo dừng; không ép AVAILABLE (`.backups/demo-busy-guard.log`). Đây là kiểm tra bảo vệ PASS.
- **Booking 68 / Offer 56 / Trip 2744235**: không truyền vt, BIKE; ban đầu SEARCHING; Offer thuộc DID 68/UID 56 của t1; Accept tạo Trip. Customer sở hữu thấy Nguyen Van An / BIKE / 59A10001, Customer khác 403.
- Trip 2744235: `A → I_G → location → C`; response/DB/history lần lượt ASSIGNED, ARRIVED, IN_PROGRESS, COMPLETED. `X` 400, nhảy ASSIGNED → C 400, Driver khác/Customer 403, thiếu JWT 401, đổi sau COMPLETED 409.
- **Booking 69 / Offer 57 / Trip 2744236**: nhập đủ ARRIVED → IN_PROGRESS → COMPLETED vẫn PASS.
- **Booking 70 / Offer 58 / Trip 2744237**: Customer hủy, CANCELED không chuyển C (409); t1 trở lại AVAILABLE qua terminal event. Trip BUSY của t2 giữ nguyên. Hash toàn bộ các hàng Driver/Profile/Vehicle/Location/Application ngoài nhóm demo không đổi trong smoke riêng (bao gồm Driver 52 nếu có).
- Observer RabbitMQ riêng thấy `trip.status.changed` chỉ có ASSIGNED/ARRIVED/IN_PROGRESS/COMPLETED và `trip.completed`; không có alias trong event. Chỉ xóa queue observer do smoke tạo, không đọc/purge queue của service.
- Full smoke `18394e0d9f00` PASS cả Booking → Offer → Accept → Trip/location → Payment/callback/replay → Review; Cancel hai người nhận, dedup, SQLi/JWT/RBAC/XSS/Redis 429 và replay cả 8 event. Dùng key mới `DEMO5-20261027-201820`, không chiếm/sửa Payment đã dùng P1 trước đó. Driver riêng của full smoke được đưa OFFLINE, không phải t1–t5.
- Sau tất cả kiểm tra: 13/13 container running/healthy; 8/8 business service HEALTHY; `/health`, `/ready`, `/health/services` HTTP 200; t1 AVAILABLE, t2 BUSY, t3–t5 OFFLINE.

### Những lần thử ban đầu và cách xử lý

- Chạy Gateway test trong sandbox bị EACCES khi kết nối localhost; chạy lại với quyền socket phù hợp đạt 93/93, root cũng đạt 264/264.
- Volume cũ yêu cầu DriverApplication APPROVED/REJECTED có `rev_at`; lần chèn seed đầu bị rollback do CHECK constraint. Script đã bổ sung người/thời điểm duyệt theo schema thực tế, không sửa schema. Account demo tạo trong lần thử được tái sử dụng, không tạo trùng.
- Smoke ban đầu kỳ vọng nhảy ASSIGNED → COMPLETED trả 409; source hiện hành trả 400. Chỉ sửa kỳ vọng của helper, không đổi state machine. Trip test mới 2744234 được Customer test hủy qua API và giữ bản ghi; lần chạy sau PASS đầy đủ.

### Lệnh nghiệm thu

```bash
npm test
python scripts/prepare-demo-drivers.py
python scripts/smoke-demo-drivers.py
# Full smoke: mỗi lần dùng key mới để bảo toàn Payment cũ.
python scripts/smoke-local-full.py --idempotency-key DEMO5-$(date +%Y%m%d-%H%M%S)
docker compose config --quiet
docker compose config --services
docker compose ps
git diff --check
```

`smoke-demo-drivers.py` có ghi dữ liệu test mới, chỉ nên chạy khi t1 AVAILABLE và không có người đang demo cùng lúc. Nếu nó gặp lỗi sau khi tạo Trip, helper hủy đúng Trip mới của lần test bằng Customer test để tránh giữ t1 BUSY; không xóa bản ghi. Log/kết quả private trong `.backups/` không được đưa lên Git.


## File thay đổi

- `services/api-gateway/src/routes/trip.routes.js`: chuẩn hóa alias, giữ nguyên context/RBAC và RPC.
- `services/api-gateway/tests/gateway.test.js`: thêm 7 test cho 6 input hợp lệ và bảo toàn lỗi/phân quyền.
- `docs/api/trips.yaml`: chỉ cập nhật input StatusRequest, không đổi enum response.
- `scripts/prepare-demo-drivers.py`: kiểm tra, backup và seed local idempotent; BUSY có Trip thật.
- `scripts/smoke-demo-drivers.py`: nghiệm thu qua `/api`, dùng Customer/Trip test mới; observer queue riêng, không đọc/purge queue service.
- `docs/test/DEMO_DRIVERS_READINESS.md`: hướng dẫn và bằng chứng hiện tại.

## Lưu ý

- ID/availability trong báo cáo là snapshot; sau demo t1 Accept sẽ BUSY cho đến khi Trip kết thúc.
- Cảnh báo network `cab-network` cũ vẫn xuất hiện khi Compose cập nhật Gateway; network được giữ nguyên. Cấu hình hiện hành và 13 container vẫn hoạt động; không xóa network trong milestone này.
- Dữ liệu test mới được giữ lại để truy vết. Không xóa database/volume hoặc dữ liệu cũ; backup và log chỉ nằm trong `.backups/`.
