# Admin danh sách và bằng chứng Encryption at Rest — 28/10/2026

## Postman trắng

Đăng nhập tài khoản Admin **đã có** `a@a.com / 123`, dùng Authorization → Bearer Token; không cần body, Collection hoặc Environment.

| URL GET | Kết quả |
|---|---|
| http://localhost:8080/api/customers | Total + Items toàn bộ Customer, không phân trang |
| http://localhost:8080/api/customers/<cid> | Chi tiết Customer hiện hành |
| http://localhost:8080/api/drivers | Total + Items toàn bộ Driver, tất cả trạng thái |
| http://localhost:8080/api/drivers/<did> | Chi tiết Driver hiện hành |
| http://localhost:8080/api/admin/security | Ba phần bằng chứng #24; chỉ có URL này, không alias /api/v1 |

Customer/Driver không được xem danh sách hoặc endpoint security. API chi tiết giữ nguyên ownership/RBAC hiện hành. Danh sách không trả phone Customer, password hoặc license Driver. Nếu HTTP 429, chờ Retry-After hoặc 11 giây; không bỏ rate limit.

## Cờ demo và cách áp dụng an toàn

Mặc định `DEMO_SECURITY_ENABLED=false` trong Compose và .env.example, kể cả NODE_ENV=production. Khi không bật, route security trả 404 trước kiểm tra token. Danh sách Admin luôn có và không phụ thuộc cờ demo.

Git Bash trên Windows, chỉ build/recreate app liên quan:

```bash
docker compose build auth-service customer-service driver-service api-gateway
DEMO_SECURITY_ENABLED=true docker compose up -d --no-deps auth-service customer-service driver-service api-gateway
```

Tắt security sau demo:

```bash
DEMO_SECURITY_ENABLED=false docker compose up -d --no-deps auth-service driver-service api-gateway
```

Đã bật bằng ENV cho ba container hiện tại; không sửa .env thật. Container giữ cờ qua restart Docker. Khi up/recreate lại phải truyền cờ, hoặc chủ project tự đặt DEMO_SECURITY_ENABLED=true trong .env local; lệnh up không truyền cờ sẽ dùng cấu hình mặc định false nếu .env chưa có giá trị. Không bật cho production. Không recreate RabbitMQ/database, không đổi broker hostname/node/volume. Cảnh báo network cab-network cũ được giữ nguyên ngoài phạm vi này.

## Bằng chứng và giới hạn

- Auth chỉ đọc toàn bộ `auth_db.user_account.pw_hash`: kiểm tra định dạng bcrypt/cost, không trả digest. Bcrypt là hash một chiều. PASS chứng minh định dạng lưu trữ trong trường này; không chứng minh mật khẩu mạnh hoặc không tồn tại bản sao plaintext ở vị trí chưa kiểm tra.
- Driver chỉ đọc `driver_db.driver_profile.lic_enc`: gọi helper AES-256-GCM hiện hành để xác thực tag của từng giá trị không NULL, bỏ plaintext sau kiểm tra. NULL không được tính như ciphertext hợp lệ. Không trả nonce, tag, ciphertext hay license gốc.
- Key Management kiểm tra ENV có cấu hình, base64 hợp lệ/32 byte và khả năng xác thực dữ liệu thật. Hardcoded Key Check và trạng thái tổng phần này là **UNVERIFIED** khi khóa hợp lệ: chưa kiểm toán toàn bộ source/Git, độ mạnh/nguồn gốc khóa hoặc chứng minh khác khóa demo công khai. Không đổi/rotate khóa vì có thể làm dữ liệu cũ không đọc được.
- Dữ liệu trống/dependency không trả được bằng chứng: UNVERIFIED. Dữ liệu không hợp lệ: FAIL. Không có JSON PASS cố định; số lượng/status thay đổi theo DB/config thực tế. Downstream lỗi được che, không đưa nội dung lỗi chứa credential ra response.
- Gateway chỉ gọi gRPC tới Auth/Customer/Driver; không kết nối DB. RPC mới: Customer.ListCustomers, Driver.ListDrivers, Auth.GetPasswordAtRestEvidence, Driver.GetLicenseAtRestEvidence. Không thêm domain gRPC edge, service, DB hoặc event.

## JSON response thực tế (snapshot trước full smoke)

Số bản ghi sẽ thay đổi khi tạo thêm dữ liệu; đây là response thật đã kiểm tra, không phải giá trị hardcode trong implementation.

Response dài cũ đã được thay bằng JSON rút gọn ở phần cuối báo cáo; bằng chứng gốc vẫn nằm trong .backups/.

## Kiểm thử đã thực hiện

| Kiểm tra | Kết quả |
|---|---|
| Root npm test | 287 PASS / 0 FAIL |
| Auth / Customer / Driver | 17 / 10 / 27 PASS |
| Booking / Trip / Payment | 47 / 23 / 19 PASS |
| Notification / Review / Gateway / Shared | 13 / 12 / 108 / 11 PASS |
| Danh sách ADMIN | 200; 30 Customer + 37 Driver khớp DB tại snapshot trước full smoke |
| Danh sách CUSTOMER / DRIVER / no token | 403 / 403 / 401 |
| Chi tiết Customer/Driver bằng Admin | 200, cùng ID với danh sách |
| Security tắt: Admin/Customer/Driver/no token | 404 / 404 / 404 / 404 trên stack thật |
| Security bật: Admin/Customer/Driver/no token/sai JWT | 200 / 403 / 403 / 401 / 401 trên stack thật |
| Không lộ hash/ciphertext/IV/tag/key | PASS, so sánh giá trị thật ngay trong container, không xuất secret ra log/Python |
| Không lộ license plaintext | PASS, giải mã/so sánh ngay trong Driver container, không in plaintext |
| GET không sửa DB | Digest toàn bộ Account, CustomerProfile, Driver, DriverProfile, Vehicle, Location, Application không đổi trước/sau; cả OFF và ON |
| Không có dữ liệu/khóa thiếu/ciphertext hỏng | Unit test xác minh UNVERIFIED/FAIL, không giả PASS |
| Production mặc định tắt | Test config NODE_ENV=production, thiếu cờ → false/route 404 |
| Syntax | 152 file JS PASS |
| Legacy scan | Không có routing key/model legacy |
| git diff --check | PASS |

Full E2E của milestone Admin ban đầu (trước đợt rút gọn): **31/31 checks PASS, 30/30 rubric**, run `3a4bf8a77409`. Đây là lượt kiểm thử riêng có tạo Customer/Driver/Booking test mới, giữ bản ghi nguồn và đưa Driver test về OFFLINE; không phải các GET Admin ghi dữ liệu. Không sửa Driver 52 hoặc nhóm t1–t5.

Bằng chứng private/ignored: `.backups/admin-security-root-tests.log`, `admin-readonly-off.log/json`, `admin-readonly-on.log/json`, `admin-security-full-smoke.log`. Không đưa .backups/ lên Git. Không tạo Admin mới; không chạy migration hoặc xóa dữ liệu/volume. Live tests của ba API chỉ đọc dùng token từ tài khoản Admin hiện có.

## File thay đổi của milestone Admin ban đầu

- Contract: `proto/auth.proto`, `proto/customer.proto`, `proto/driver.proto` (chỉ thêm RPC/message, giữ nguyên trường/method cũ).
- Gateway: `src/app.js`, `src/config/env.js`, `src/routes/customer.routes.js`, `src/routes/driver.routes.js`, **mới** `src/routes/admin-security.routes.js`, `tests/gateway.test.js` trong services/api-gateway.
- Auth: `src/grpc/auth.grpc.js`, `src/repositories/user.repository.js`, `src/services/auth.service.js`, **mới** `src/services/password-evidence.js`, `tests/auth.test.js`, **mới** `tests/password-evidence.test.js` trong services/auth-service.
- Customer: `src/grpc/customer.grpc.js`, `src/repositories/customer.repository.js`, `src/services/customer.service.js`, `tests/customer.test.js` trong services/customer-service.
- Driver: `src/grpc/driver.grpc.js`, `src/repositories/driver.repository.js`, `src/services/driver.service.js`, **mới** `src/security/at-rest-evidence.js`, `tests/driver.test.js`, **mới** `tests/at-rest-evidence.test.js` trong services/driver-service. Không sửa OTP/approval/availability/location/matching/encryption helper hiện hành.
- Cấu hình/tài liệu: `.env.example`, `docker-compose.yml`, `AI_CONTEXT.md`, `docs/requirements/SRS.md`, `docs/api/README.md`, `docs/api/users.yaml`, `docs/api/drivers.yaml`, **mới** `docs/api/admin-security.yaml`, **mới** báo cáo này.
- Giữ nguyên mọi thay đổi chưa commit từ milestone trước; không tự commit/push.

## Câu thuyết trình

> API Admin này lấy bằng chứng từ database thật qua đúng service sở hữu dữ liệu: mật khẩu được băm bcrypt một chiều, giấy phép được mã hóa và xác thực bằng AES-256-GCM; kết quả chỉ có metadata đã che và không tiết lộ khóa.

Nếu được hỏi về hardcode: phần đó ghi UNVERIFIED vì API không kiểm toán toàn bộ source và lịch sử Git; không dùng PASS của hai phần lưu trữ để kết luận hệ thống bảo mật tuyệt đối.

## Snapshot lịch sử sau full smoke ban đầu

Danh sách hiện có **31 Customer**, **39 Driver**, vẫn khớp DB. Số lượng thay đổi do full smoke tạo dữ liệu test, chứng minh endpoint truy vấn động, không hardcode.

Response dài cũ đã được thay bằng JSON rút gọn ở phần cuối báo cáo; bằng chứng gốc vẫn nằm trong .backups/.

## Đợt rút gọn response (28/10/2026)

- URL hiện hành duy nhất là `GET /api/admin/security`; URL cũ `/api/admin/security/at-rest` trả 404, không redirect hoặc giữ alias. Không có bản `/api/v1`.
- Chỉ đổi trình bày ở Gateway. Hai RPC bằng chứng, query Auth/Driver và helper bcrypt/AES-GCM giữ nguyên.
- `Encrypted` của Password là tỷ lệ hash bcrypt hợp lệ, không phải mã hóa giải mã được. `Plaintext Stored=false` chỉ giới hạn ở `pw_hash` đã kiểm tra, và chỉ khi số lượng >0, tất cả hợp lệ, không có giá trị sai. Thiếu bằng chứng hoặc có giá trị sai thì trường này UNVERIFIED.
- `Encrypted Records` là số ciphertext đã xác thực thành công; khi chưa xác minh được dùng UNVERIFIED. `Missing Records` chỉ đếm NULL/chưa có giấy phép.
- `Plaintext Exposed=false` và `Key Exposed=false` chỉ nói endpoint không trả dữ liệu đó, không phải kết luận mọi nơi đều không lưu plaintext/key. Gateway dùng whitelist nhãn/status/số lượng/boolean, không truyền raw value từ service ra response.
- Trạng thái Key Management giữ UNVERIFIED khi chưa kiểm toán đủ source/lịch sử/nguồn gốc khóa; không chuyển thành PASS chỉ vì khóa ENV hợp lệ.
- Không chạy lại full E2E ghi dữ liệu trong đợt chỉ đổi URL/hiển thị này. Root regression chạy lại toàn bộ đạt 287/287 (Gateway 108/108); live test chỉ GET/SELECT và login tài khoản cũ, không tạo bản ghi mới.
- File cập nhật đợt này: `services/api-gateway/src/routes/admin-security.routes.js`, `services/api-gateway/tests/gateway.test.js`, `docs/api/admin-security.yaml`, `docs/api/README.md`, `docs/requirements/SRS.md`, `AI_CONTEXT.md`, báo cáo này. Không sửa Proto, Auth/Driver business implementation, Compose, .env hoặc migration.

### Nghiệm thu response rút gọn trên stack thật

- ON: Admin 200, Customer/Driver 403, thiếu/sai token 401; schema đúng 3 nhóm ngắn, số liệu khớp DB.
- OFF: URL mới 404 với mọi role/no token. URL cũ 404 cả khi ON và OFF; không redirect/alias.
- Không trả password hash, license plaintext, ciphertext, IV/tag hoặc khóa; đã so sánh dữ liệu thật ngay trong container mà không xuất giá trị ra terminal.
- Digest toàn bộ user_account và driver_profile không đổi sau GET, cả ON/OFF. Không tạo dữ liệu nghiệp vụ mới.
- Log mới: .backups/security-compact-root-tests.log, security-compact-on.log/json, security-compact-off.log/json; .backups/ được gitignore.
- Đã cập nhật và bật demo ở Gateway đang chạy. Auth/Driver và khóa/DB giữ nguyên.

```json
{
  "Password": {
    "Status": "PASS",
    "Algorithm": "bcrypt",
    "Checked Records": 71,
    "Encrypted": "71/71 password hashes",
    "Plaintext Stored": false
  },
  "Sensitive Data": {
    "Status": "PASS",
    "Algorithm": "AES-256-GCM",
    "Data": "Driver License",
    "Encrypted Records": 12,
    "Missing Records": 27,
    "Plaintext Exposed": false
  },
  "Key Management": {
    "Status": "UNVERIFIED",
    "Source": "Environment Variable",
    "Key Configured": true,
    "Key Valid": true,
    "Key Exposed": false
  }
}
```

Câu thuyết trình ngắn: “Trong phạm vi dữ liệu đã kiểm tra, mật khẩu được băm bcrypt và giấy phép được xác thực AES-256-GCM; API chỉ trả số liệu, không lộ dữ liệu gốc hoặc khóa.”

