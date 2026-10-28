# 10 Customer demo — nghiệm thu 28/10/2026

Email ban đầu c1@c…c10@c bị validator email hiện hành từ chối vì thiếu phần mở rộng tên miền. Chủ project đã chọn c1@c.com…c10@c.com trước khi tạo. Không sửa Gateway/Auth/Customer hoặc nới validation.

Mật khẩu 123 chỉ dành cho dữ liệu demo cục bộ. Account role CUSTOMER, ACTIVE; phone của 10 Profile là NULL. UID/CID do DB tự cấp và liên kết logic bằng uid, không hardcode trong script.

| Email | Password | User ID | Customer ID | Login |
|---|---|---:|---:|---|
| c1@c.com | 123 | 83 | 29 | PASS |
| c2@c.com | 123 | 84 | 30 | PASS |
| c3@c.com | 123 | 85 | 31 | PASS |
| c4@c.com | 123 | 86 | 32 | PASS |
| c5@c.com | 123 | 87 | 33 | PASS |
| c6@c.com | 123 | 88 | 34 | PASS |
| c7@c.com | 123 | 89 | 35 | PASS |
| c8@c.com | 123 | 90 | 36 | PASS |
| c9@c.com | 123 | 91 | 37 | PASS |
| c10@c.com | 123 | 92 | 38 | PASS |

## Cách chạy — Git Bash

```bash
# Chỉ kiểm tra, không ghi:
python scripts/seed-demo-customers.py

# Tạo/bổ sung nếu cần, giữ nguyên Account/Profile hợp lệ đã có:
python scripts/seed-demo-customers.py --apply --backup-user cab_user

# Tùy chọn: thêm đúng một Booking test mới mỗi lần dùng cờ này:
# python scripts/seed-demo-customers.py --apply --backup-user cab_user --check-booking
```

cab_user là superuser đã xác minh trên volume local cũ, không phải mật khẩu. Với DB mới và runtime user đủ quyền backup có thể bỏ --backup-user. Script backup auth_db và customer_db vào .backups/demo-customers-*/ trước khi ghi. Không log token/password hash, không sửa .env. Tôn trọng rate limit 3/10 giây, có thể cần chờ vài phút để kiểm tra 10 login/own-profile/cross-owner.

- Đăng ký mới qua POST /api/register, dùng bcrypt của Auth hiện hành.
- Tài khoản đã có chỉ được tái sử dụng khi đúng email, role CUSTOMER, ACTIVE, mật khẩu 123 và tên Customer tương ứng. Sai điều kiện thì dừng, không reset mật khẩu/đổi role/ghi đè hồ sơ.
- Nếu thiếu Profile, chỉ bổ sung qua Customer Service hiện hành sau khi xác minh login đúng UID; không chiếm Profile của UID khác. Nhánh này không phát sinh trong dataset lần này: thiếu Profile = 0.
- Không đồng thời chạy hai phiên seed hoặc demo chỉnh hồ sơ. Nếu lỗi giữa Account và Profile, giữ dữ liệu để chạy lại; không xóa Account hoặc rollback bằng cách reset DB.

## Kết quả đã chạy thực tế

| Kiểm tra | Kết quả |
|---|---|
| Lần đầu | Tạo mới 10 Account + 10 Profile; 0 có sẵn |
| Chạy lại --apply | 0 mới, 10 có sẵn, 0 Profile bổ sung, không Booking thêm |
| Không trùng email/UID/CID, đúng logical uid | PASS 10/10 |
| Hash bcrypt + mật khẩu 123 | PASS 10/10, so sánh trong Auth container, không xuất hash |
| Login/JWT CUSTOMER và xem chính hồ sơ qua Gateway | PASS 10/10 |
| Customer i xem Customer i+1, c10 xem c1 | 10/10 trả HTTP 403; không kiểm tra toàn bộ 90 cặp |
| Client Booking → Customer GetByUserId + ValidateCustomer | PASS 10/10 hồ sơ, 20 RPC read-only |
| Một Booking thực tế bằng c1 | HTTP 201, Booking 81, BIKE, CID 29, NO_DRIVER_FOUND |
| Payment phát sinh từ Booking test | Đúng một Payment 79, amount 50000, PENDING, eligible=false, tid=NULL |
| Offer / Assignment / Trip của Booking test | 0 / 0 / 0; vùng test không có Driver BIKE hợp lệ, không chiếm Driver demo |
| Các Account/Profile ngoài nhóm | Hash tổng hợp không đổi cả hai lần seed |
| 10 Account/Profile sau rerun | Toàn bộ row/hash/timestamps không đổi |
| Tài khoản c@c.com, d@d.com, a@a.com | Login lại HTTP 200, đúng CUSTOMER/DRIVER/ADMIN |
| Auth regression | 14 PASS / 0 FAIL |
| Customer regression | 9 PASS / 0 FAIL |

JWT được kiểm tra claim role/sub rồi dùng gọi endpoint bảo vệ; Gateway xác minh signature/expiry trước khi trả hồ sơ. Không dùng payload decode chưa xác minh để tạo dữ liệu.

Chỉ tạo một Booking để chứng minh luồng thật và xác minh các hồ sơ còn lại qua đúng gRPC mà Booking đang dùng; không tuyên bố đã tạo Booking cho cả 10. Không chạy lại full 30-rubric E2E trong milestone chỉ seed này; không sửa source nghiệp vụ. Không chạy migration, xóa dữ liệu hoặc recreate volume, không commit/push.

## Bằng chứng riêng tư (gitignored)

- .backups/demo-customers-seed.log
- .backups/demo-customers-rerun.log
- .backups/demo-customers-*/result.json và backup hai DB
- .backups/demo-customers-booking-check.json
- .backups/demo-customers-auth-tests.log
- .backups/demo-customers-customer-tests.log

Không đưa thư mục .backups/ lên Git. Các file mới của milestone: scripts/seed-demo-customers.py và báo cáo này; giữ nguyên thay đổi chưa commit từ các milestone trước.
