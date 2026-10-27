# CAB System MSA — Final Verification & Submission Readiness

Ngày kiểm tra: **27/10/2026**, trên repository và Docker stack local hiện hữu. Chỉ sửa tài liệu; không commit/push/tag, sửa source nghiệp vụ/contract, migration, restart, recreate hoặc xóa dữ liệu.

## 1. Executive Summary

**READY WITH WARNINGS — sẵn sàng nộp/demo học phần với các lưu ý bên dưới.**

- Chạy lại **257/257 unit/gRPC + 10/10 RabbitMQ bootstrap offline tests: PASS, 0 FAIL**.
- Ma trận rubric: **30 PASS / 0 FAIL / 0 UNVERIFIED**, dựa trên trace E2E gốc còn lưu, test code hiện tại, regression chạy lại và đọc trạng thái/dữ liệu thật. Không chỉ sao chép kết luận từ report cũ.
- Kế thừa có kiểm tra bằng chứng: **19/19 DB integration**, **31/31 E2E**, smoke bổ sung CAR/OTP và P1 replay. Không chạy lại các suite ghi fixture trong lần rà soát này.
- Hiện tại **13/13 containers healthy**, **8/8 business services HEALTHY**, Gateway health/readiness HTTP 200. RabbitMQ bootstrap mới đã hoạt động, quyền và topology đúng.
- Hai kiểm tra vòng đời ngoài rubric là **UNVERIFIED** trong milestone này: tắt/mở Docker Desktop hoặc restart/recreate broker thật; khởi động mới hoàn toàn trên máy/volume trống. Không thực hiện vì yêu cầu giữ nguyên stack/dữ liệu.
- Lưu ý: khóa AES demo công khai đang được dùng local; consumer chưa tự subscribe lại sau broker restart riêng; DDD còn thiếu chi tiết một số bổ sung canonical đã được chủ dự án chấp thuận. Không tự sửa các điểm ảnh hưởng bảo mật/runtime/contract.

Đánh giá này dành cho dataset giả và đồ án local, không phải chứng nhận bảo mật production. Nếu có dữ liệu giấy phép thật được mã hóa bằng khóa demo công khai, cần xử lý key rotation/re-encryption được duyệt trước khi coi môi trường đó an toàn cho dữ liệu thật.

## 2. Git Status

Trước khi sửa tài liệu, `git status` cho thấy **working tree sạch**, không staged/untracked file cần nộp. HEAD thực tế là **`3eb2092` — `feat: finalize CAB System MSA rubric demo`**, main ahead `origin/main` một commit theo remote-tracking ref local. Vì vậy nhận định “mọi thay đổi mới nhất chưa commit” trong đầu bài đã không còn đúng; không reset/amend hoặc ghi đè commit này.

- `git diff --stat`, `git diff --check`, `git diff --cached --check`: sạch ở đầu đợt.
- Đã kiểm tra danh mục **258 tracked files**, các file mới của Demo Rubric đã nằm trong HEAD; không có source 0 byte, không có required source/test/migration bị bỏ sót hoặc ignore nhầm.
- Các file quan trọng có đủ: `scripts/migrate-demo-rubric.py`, `scripts/ensure-bike-demo.py`, `infrastructure/postgres/migrations/20261027_demo_rubric.sql`, `RUBRIC_DEMO_VALIDATION.md`, README, AI_CONTEXT, SRS, DDD, proto và API specs.
- `.env`, `.backups/`, node_modules và local `docker-compose.override.yml` vẫn ignored; không có dump/log/private key/cache/zip nhạy cảm trong tracked files. `.postman/resources.yaml` chỉ chứa workspace ID/spec references; globals rỗng, không token và không bắt buộc để demo Postman trắng.
- Cuối milestone chỉ có ba file tài liệu ở mục 8 cần review/commit. Không stage/commit/push tự động. Quyền push và trạng thái server GitHub không được kiểm thử; “ahead 1” là so với ref local, không thay cho kiểm tra remote mới.

## 3. Architecture Compliance

Nguồn đối chiếu: README, AI_CONTEXT, SRS hiện hành; `docs/architecture/DDD.docx` canonical (đọc nội dung DOCX, không dùng bản DDD lịch sử); proto, `docs/api/*.yaml`, `contracts/events/`, init/migration và source thực tế.

| Nội dung | Kết quả kiểm tra |
| --- | --- |
| Runtime | Auth, Customer, Driver, Booking, Trip, Payment, Notification, Review + Gateway + PostgreSQL/MongoDB/Redis/RabbitMQ; đúng 13 thành phần |
| Ingress | Chỉ Gateway 8080 public business API; RabbitMQ Management 15672. Business services, PostgreSQL, MongoDB, Redis không publish host port |
| REST/gRPC | `/api` dùng được; `/api/v1` là alias tương thích có trước, không bị bắt buộc. Registry Gateway đúng 8 clients |
| Domain gRPC | Source chỉ có Booking → Customer, Booking → Driver, Trip → Driver, Review → Trip; không thêm cạnh |
| DB ownership | Bảy service PostgreSQL dùng đúng auth_db/customer_db/driver_db/booking_db/trip_db/payment_db/review_db; Notification dùng MongoDB notification_db. Không thấy SQL kết nối DB của context khác |
| Redis | Chỉ Gateway rate-limit/cache; không có domain persistence hoặc Payment idempotency bằng Redis |
| Events | Registry/source/definitions/AsyncAPI giữ đúng 8 routing keys; bốn queue và 11 bindings live khớp definitions |
| Nghiệp vụ | Một Offer/Assignment/Trip; Payment từ booking.created; trip.completed chỉ mở eligibility; state machine, paid projection, ownership và Review đúng bằng chứng test/dữ liệu |

PostgreSQL volume cũ còn `audit_db`, `reporting_db`, `notification_db` và schema/bảng lưu trữ lịch sử. Đây là dữ liệu được yêu cầu giữ nguyên từ recovery, **không phải service/database mới đang được runtime sử dụng**. Notification hiện kết nối MongoDB. Không xóa các DB/bảng cũ để làm danh sách “đẹp”.

Phân loại những khác biệt tài liệu/triển khai:

| Điểm | Phân loại / xử lý |
| --- | --- |
| DDD mô tả payload tối thiểu chưa liệt kê User IDs; câu dedup “cùng sourceEventId” chưa nói rõ recipient | Chi tiết tài liệu chưa cập nhật hết quyết định đã chấp thuận. SRS/AsyncAPI/contracts và code canonical hiện dùng recipientUserIds + UNIQUE(eid,uid). Không đổi contract hoặc sửa DDD trong đợt này |
| Phone, OTP 300 giây, BIKE mặc định, Driver summary và snapshot Pay chi tiết hơn aggregate DDD | Bổ sung Demo Rubric đã được chấp nhận và ghi trong SRS/proto/API/AI_CONTEXT; không phải lý do đổi ngược code |
| Register gửi lại cùng hồ sơ sau OTP đã tiêu thụ trả cùng grant/UID/DID | Resume idempotent đã ghi trong SRS; không phải xác thực OTP lần hai để tạo hồ sơ mới. Hồ sơ khác/phone khác/hết hạn trước xác thực bị từ chối |
| Consumer channel đóng không tự subscribe lại | Giới hạn triển khai hạ tầng, xem W2; chỉ ghi nhận, không refactor shared runtime |
| README RabbitMQ còn mô tả bootstrap chưa kích hoạt | Lỗi tài liệu đã sửa theo inspect container thật |

## 4. Docker Health và RabbitMQ

Đã resolve `docker compose config` vào bộ nhớ để kiểm tra, không in secret; chạy `config --quiet`, `config --services`, `ps` và health HTTP từ Git Bash.

| Container | Trạng thái |
| --- | --- |
| postgres / mongodb / redis / rabbitmq | 4/4 running, healthy |
| auth-service / customer-service / driver-service / booking-service | 4/4 running, healthy |
| trip-service / payment-service / notification-service / review-service | 4/4 running, healthy |
| api-gateway | running, healthy |

Tất cả 13 container có restartCount=0 tại lần inspect. `/api/health`, `/api/ready`, `/api/health/services`: HTTP 200, HEALTHY; endpoint cuối trả đúng 8 services HEALTHY.

RabbitMQ:

- Entry point thật: `python3 /etc/rabbitmq/bootstrap.py`; healthcheck thật: cùng script với `--healthcheck`.
- Local override giữ node `rabbit@a249ac00f63c`, hostname tương ứng; node đang chạy, ENV và thư mục Mnesia đều khớp. Named volume `cab-system_cab_rabbitmq_data` vẫn mount `/var/lib/rabbitmq`. Fresh checkout dùng hostname ổn định `cab-rabbitmq`, không phụ thuộc hostname máy Windows.
- Account từ ENV đăng nhập Management API thành công, vhost `/`, configure/write/read đều `.*`; health alarms/virtual-hosts/AMQP listener đều `ok`. Không in mật khẩu/hash/Authorization.
- Exchange `cab.events` topic/durable; `cab.driver.q`, `cab.notification.q`, `cab.payment.q`, `cab.trip.q` đều durable, mỗi queue có 1 consumer, ready/unacked=0 tại lần kiểm tra.
- Đúng 8 keys: booking.created, offer.created, driver.accepted, driver.approval.changed, trip.status.changed, trip.canceled, trip.completed, payment.completed. Notification không có booking.created binding.
- Các container cùng vào `cab-system_cab-network`; labels hiện khớp project cab-system/network cab-network. Override external không gây cảnh báo label ở lần config hiện tại. PostgreSQL/Redis vẫn ở cả network cũ `cab-network`; không tự tháo/xóa network đó.
- Scan log 30 phút gần nhất (tối đa 500 dòng/container): không thấy mẫu permission denied/access refused/connection refused/ENOTFOUND/authentication failed. Đây là kiểm tra có phạm vi thời gian, không khẳng định toàn bộ lịch sử log sạch.

Bootstrap lặp lại/idempotency được kiểm tra offline 10/10; broker live đang dùng bootstrap và healthcheck đó. Không đồng nhất bằng chứng này với một lần restart/recreate thật: vòng đời ấy vẫn UNVERIFIED trong đợt này. Startup app có dependency gating, fail/restart policy và gRPC deadline; người demo vẫn cần đợi `/api/ready` và kiểm tra consumers.

## 5. Security Audit

Đã quét tracked files (kể cả XML trong DOCX/XLSX), untracked có thể nộp, staged state và **88 reachable commits / 596 blobs** của các Git refs local. Không fetch/rewrite lịch sử. Đối chiếu giá trị runtime trong bộ nhớ và pattern private keys/JWT/GitHub tokens/AWS keys; chỉ xuất tên rule/file, không xuất giá trị.

| Hạng mục | Kết quả / giới hạn |
| --- | --- |
| `.env`, dumps, backups, tokens | Không có `.env` từng tracked trong các refs đã quét; không thấy private key/token hay runtime JWT/DB/RabbitMQ/Redis password bị commit. `.backups/` và node_modules ignored |
| `.env.example` | Mật khẩu/JWT là placeholder. Có khóa AES DEVELOPMENT-ONLY cố ý công khai, runtime local đang dùng cùng khóa: **W1**, không được gọi đó là khóa riêng tư |
| Bcrypt | Toàn bộ pw_hash trong user_account canonical có prefix bcrypt; unit/DB evidence xác minh password không plaintext và compare đúng |
| AES-256-GCM | Helper dùng ENV, key 32 byte, nonce ngẫu nhiên 12 byte, auth tag 16 byte; 12 lic_enc hiện có đều theo format v1. Tampering/round-trip được unit test; không dump/decrypt license ra báo cáo |
| JWT | `jwt.verify` HS256, bắt buộc sub/role/exp; test thiếu/sửa/hết hạn chữ ký không hợp lệ → 401 |
| SQLi | Query parameterized; SQLi login bị chặn; unit/gRPC chạy lại và E2E cũ có bằng chứng |
| XSS | sanitize-html loại script/event handlers; comment tiếng Việt/dấu câu hợp lệ có test. Record XSS E2E hiện tại không chứa executable script |
| RBAC/ownership | Cùng Driver endpoint Admin 200 / Customer 403; Trip/Payment/Review không cho Customer khác sở hữu; không trả phone qua lookup Booking/Driver summary |
| Rate limiting | Redis vẫn áp dụng `/api`; E2E thật 200/200/200/429; unit kiểm tra cửa sổ, fail-closed và health không bị chặn |
| Payment replay | Row lock, unique key, request/response JSONB; replay trả snapshot, khác request 409; không tạo Payment/event thứ hai theo test/trace |

Không phát hiện bằng chứng credential production khác đã bị commit trong phạm vi scan. Scan pattern/đối chiếu không chứng minh tuyệt đối rằng mọi chuỗi tùy ý trong mọi binary đều không nhạy cảm; không kiểm tra GitHub refs ngoài local. Không cần tự rewrite Git history. Nếu sau này phát hiện key/token thật ở ref khác: rotate/revoke trước, kiểm tra phạm vi và xin duyệt quy trình làm sạch lịch sử; không dùng force-push tự động.

## 6. Rubric Coverage — 30 dòng

Nguồn phiếu chấm dùng để đối chiếu: sheet **30 Rubric Smoke Test Cases**, vùng **A2:H31** trong `CAB System Test Cases.xlsx`; không tìm thấy file phiếu chấm độc lập mới hơn. Đã đọc các bước và expected result của từng case. Không sửa workbook.

Ký hiệu bằng chứng:

- **E01–E31**: các check theo thứ tự trong trace smoke run **58ff5d113dbe**, `/api`, 27/10/2026. Đã đọc JSON/log gốc tại `.backups/` và đối chiếu assertion trong `scripts/smoke-local-full.py`; không đưa raw backup/token vào Git. Bản tóm tắt nộp được ở [RUBRIC_DEMO_VALIDATION.md](RUBRIC_DEMO_VALIDATION.md).
- **U**: unit/gRPC hiện tại chạy lại PASS; **DB-cũ**: 19 DB tests với log đã kiểm tra, không chạy lại; **R**: inspect/HTTP/Management/source đọc lại trong milestone này; **D**: đọc aggregate dữ liệu đã có từ E2E, không ghi DB.
- Các ID dưới đây chỉ thuộc fixture demo: Booking 49, Trip 2744219, Payment 42, Review 23; cancellation Trip 2744221, XSS Trip 2744222. IDs trên máy khác phải lấy từ response thật.

| STT | Tiêu chí | Bằng chứng | PASS/FAIL/UNVERIFIED | Ghi chú |
| --- | --- | --- | --- | --- |
| 1 | Kiến trúc source code | E01 + R: cây services/Compose/registry | PASS | Đúng 8 business services, không Report/Audit |
| 2 | .gitignore / .env | E02 + R: git check-ignore, ls-files, scan refs | PASS | Không tracked `.env`/backup; khóa demo công khai ghi riêng W1 |
| 3 | Vai trò API Gateway | E01/E04–E06 + U Gateway 86; source middleware/routes | PASS | REST, validation, JWT/RBAC, Redis, routing gRPC |
| 4 | IPC microservices | E11/E14 + R: bốn client domain; D Booking/Assignment/Trip | PASS | gRPC synchronous + driver.accepted asynchronous |
| 5 | Docker Compose | E03 + R config/ps/inspect | PASS | 13/13 running healthy |
| 6 | Health/readiness | E03 + R HTTP qua Git Bash | PASS | 200; đúng 8 service, timeout hữu hạn; lưu ý W2 khi broker mất kết nối |
| 7 | RabbitMQ | E11/E14/E30 + R Management, permissions, 4 queues/11 bindings | PASS | Publisher/consumer có side effect; 8 event redelivery đã được E2E kiểm tra |
| 8 | Gateway-only ingress | E01 + R config/host ports | PASS | 8080 business; chỉ thêm Management 15672 |
| 9 | Register Customer | E06 + U Customer/Gateway + D fixture Customer | PASS | Account/Profile tạo đúng; phone tùy chọn |
| 10 | Login Customer | E04 + U Auth seeded roles | PASS | Login thật có trace; không in token |
| 11 | Get Customer by ID | E05/E06 + U Customer + D logical UID | PASS | Own profile, optional phone private |
| 12 | Get Driver by ID | E05/E08 + U Gateway/Driver | PASS | Admin xem cùng endpoint dùng ở #28 |
| 13 | Nearby 1 km, page/limit | E10 + U Driver + DB-cũ PostGIS | PASS | lat/lng bắt buộc, default r1/page1/limit5; không đổi thuật toán |
| 14 | Customer Booking history | E25 + U Booking + DB-cũ | PASS | Fixture có ≥5 Booking; page1/limit2; ownership |
| 15 | Đặt xe | E11–E13 + D Booking49/Payment42; smoke CAR bổ sung | PASS | BIKE mặc định; CAR tường minh; 1 Offer; Payment PENDING ban đầu |
| 16 | Driver nhận chuyến / Customer biết Driver | E13–E16 + U Trip/Gateway + D Assignment/Trip | PASS | Driver Notification, accept, BUSY, Trip đúng Driver; own Customer có summary, người khác 403 |
| 17 | Trip status + location | E17 + D history 4 state và 1 location | PASS | ARRIVED → IN_PROGRESS → location → COMPLETED; không skip state |
| 18 | Cancel Trip | E23 + D Trip canceled/reason và Mongo hai uid | PASS | r=x, Driver AVAILABLE; hai Notification, replay không nhân bản |
| 19 | Payment online mock | E11/E18/E19/E21 + U Payment + D Payment42/Trip | PASS | Payment tạo từ Booking, cùng pid mở eligibility; callback sau Pay; paid=true |
| 20 | Review | E22 + U Review + D Review23 | PASS | Star5/c=ok, đúng Trip/Driver, chỉ 1 review; trùng/sai owner bị chặn |
| 21 | Driver OTP bằng phone | E07 + smoke hết hạn bổ sung + U/DB-cũ + D registration flags | PASS | 123/300s/one-use; pending/offline; 0 ACTIVE unfinished Driver account; resume cùng hồ sơ không tạo mới |
| 22 | Admin duyệt hồ sơ | E08 + U Driver + DB-cũ; observed approval event | PASS | List/detail/approve/reject; Notification đúng Driver |
| 23 | Online / Offline | E09 + U Driver + D eligible BIKE | PASS | Chỉ APPROVED online; BUSY không tùy ý offline; 1 BIKE available trong 1 km demo |
| 24 | Encryption at rest | E26 + U Auth/license + D bcrypt/12 ciphertext values | PASS | Đạt expected result workbook hash/ciphertext; key management chỉ phù hợp demo, W1 |
| 25 | SQL Injection | E27 + U Auth/Gateway + DB-cũ | PASS | SQLi không bypass; HTTP400/401; không token |
| 26 | XSS output | E24 + U Review 12 + D XSS record | PASS | Script/event handler không còn; văn bản hợp lệ có test giữ nguyên |
| 27 | JWT tampering | E28 + U Gateway | PASS | Missing/invalid/expired/tampered trả 401 |
| 28 | Unauthorized API | E05 + U Admin200/Customer403 | PASS | Không tạo endpoint giả riêng cho test |
| 29 | Redis Rate Limit | E29 + U Gateway `/api` | PASS | Trace thật bốn request 200/200/200/429; không stress test |
| 30 | Payment Replay / response gốc | E20/E21 + P1 replay cũ + U Payment + DB-cũ đồng thời + D snapshot | PASS | Cùng pid/amount/key trả Pay PENDING snapshot; GET COMPLETED; khác request409; không double completion |

**Tổng ma trận: 30 PASS, 0 FAIL, 0 UNVERIFIED.** PASS của chức năng có thể dùng bằng chứng E2E/DB đã chạy trước đó cùng source/test và dữ liệu kiểm tra lại; không có nghĩa đã bấm lại toàn bộ request trong milestone này.

## 7. Test Results và bằng chứng mới/kế thừa

| Suite | Unit/gRPC chạy lại | DB integration kế thừa, đã đọc log |
| --- | ---: | ---: |
| Auth | 14 PASS | 4 PASS |
| Customer | 9 PASS | 2 PASS |
| Driver | 23 PASS | 4 PASS |
| Booking | 47 PASS | 3 PASS |
| Trip | 23 PASS | 2 PASS |
| Payment | 19 PASS | 2 PASS |
| Notification | 13 PASS | 1 PASS |
| Review | 12 PASS | 1 PASS |
| Gateway | 86 PASS | — |
| Shared | 11 PASS | — |
| **Tổng** | **257 PASS / 0 FAIL** | **19 PASS / 0 FAIL, không chạy lại** |

Kết quả mới khác: RabbitMQ bootstrap offline **10/10 PASS**; **149 JS** `node --check`; Python AST; **12 API YAML** parse; Bash syntax cho scripts và **7 block README**; Git Bash thực chạy version/config/ps/health; legacy scans; `git diff --check` và cached check PASS. Tổng test tự động chạy lại: **267 PASS / 0 FAIL**. Lần chạy bị sandbox chặn socket/TEMP không được coi là lỗi code; đã chạy lại với quyền phù hợp và lấy complete result, không bỏ assertion.

Full E2E **31/31**, DB **19/19**, CAR/OTP hết hạn và P1 replay là bằng chứng kế thừa đã đối chiếu log/source. Không rerun E2E, không thay đổi counter/rate-limit để tạo PASS. Đọc dữ liệu hiện tại xác nhận: một Offer/Assignment; history ASSIGNED/ARRIVED/IN_PROGRESS/COMPLETED, một location; Payment amount50000/eligible/COMPLETED có snapshot PENDING; Trip paid=true; một Review đúng Driver; XSS safe; cancellation reason; Mongo unique(eid,uid), hai recipients, không duplicate. Có 1 BIKE APPROVED/AVAILABLE gần điểm demo; 23 xe CAR còn tồn tại.

Hai mục ngoài rubric chưa chạy: **UNVERIFIED — restart/recreate/tắt mở Desktop thật**, **UNVERIFIED — fresh install trên máy/volume trống**. Không cần thực hiện hai kiểm tra này bằng cách phá stack hiện tại để nộp bài; nếu muốn nghiệm thu thêm, cần một kế hoạch môi trường riêng được duyệt.

## 8. Changed Files

Chỉ ba file tài liệu được sửa/tạo trong milestone này:

1. `README.md`: bổ sung prerequisite Windows/Git Bash, cấu hình giữ ENV, init/migration mới/cũ, kiểm tra health không in secret, dừng/mở lại không mất volume, giới hạn consumer recovery, cách chạy test và flow Postman trắng với BIKE/ID/key thật.
2. `infrastructure/rabbitmq/README.md`: sửa mô tả bootstrap/healthcheck từ “chưa kích hoạt” sang runtime đã inspect; giữ hướng dẫn bảo vệ Mnesia và bổ sung giới hạn phục hồi consumer.
3. `docs/test/FINAL_SUBMISSION_READINESS.md`: báo cáo này.

Không sửa `.env`, `.gitignore`, Compose, Dockerfiles, source/test nghiệp vụ, proto, API/event contract, migration hoặc DDD. Các file kiểm tra/log tạm chỉ nằm trong `.backups/` đã ignored; không thuộc bài nộp.

## 9. Remaining Issues / Warnings

| Mã | Mức độ / nội dung | Việc cần làm |
| --- | --- | --- |
| W1 | **Bảo mật demo:** AES runtime trùng khóa mẫu công khai đã được chấp thuận để seed demo decrypt được | Chỉ dùng dữ liệu giả. Nếu có dữ liệu thật, tạm dừng công bố dataset, lập kế hoạch backup/rotation/re-encryption; không thay ENV key đơn thuần vì ciphertext cũ sẽ mất khả năng đọc |
| W2 | **Vận hành:** consumer chỉ đăng ký lúc onStart; channel close chỉ log. Health service chủ yếu kiểm tra DB nên có thể chưa phản ánh consumer mất kết nối | Sau broker restart riêng, kiểm tra consumer count và chủ động restart app RabbitMQ theo README khi broker healthy. Đề xuất phục hồi consumer tự động cho một task riêng nếu được yêu cầu, không sửa trong đợt nộp bài |
| W3 | **Tài liệu:** DDD chưa diễn đạt hết recipient/dedup compound và các chi tiết Rubric mới | Khi được duyệt, đồng bộ phần diễn giải DDD theo SRS/contract đã chấp thuận; không đổi code hoặc tạo thêm event/edge |
| W4 | **Tính di động local:** preserved volume cần override node hiện có, nhưng override bị ignore đúng chủ đích; fresh install/restart thật chưa chạy lại | Giữ override riêng trên máy demo; không gửi `.env`/override/backup công khai. Máy mới dùng defaults của base Compose, không áp hostname cũ |

Không có blocker đang làm hỏng luồng demo hiện tại. Không kết luận “không có bất kỳ rủi ro bảo mật/vận hành nào”. Lịch sử Git đã quét không cho thấy credential riêng khác ngoài khóa demo cố ý công khai; không có lý do tự rewrite history.

## 10. Submission Checklist

- [x] Rà soát trạng thái Git thực tế và required files; đối chiếu canonical source, không dùng commit cũ làm giả định.
- [x] Root tests/Bootstrap tests, health, live RabbitMQ, dữ liệu E2E và rubric evidence đã kiểm tra.
- [x] Chỉ sửa tài liệu; không chạy migration/test ghi data; không restart/recreate/reset/delete volume.
- [x] Không stage, commit, push hoặc tag; không sửa `.env` hay secret.
- [ ] Người nộp đọc W1–W4, xác nhận dataset chỉ là demo; nếu có dữ liệu thật phải xử lý W1 trước.
- [ ] Review đúng ba file thay đổi; kiểm tra status/cached diff trước commit, không `git add -f` ignored files.
- [ ] Giữ local override và volumes hiện có trên máy demo; không cần chạy lại migration hoặc full E2E để nộp.
- [ ] Trước buổi demo, kiểm tra 13 health/8 service và bốn consumers; dùng ID từ response, key mới cho Payment mới, P1 chỉ replay Payment đã gắn nó.
- [ ] Người dùng tự kiểm tra tài khoản/quyền remote GitHub và quyết định commit/push. Không mặc định remote ref local là trạng thái GitHub mới nhất.

Lệnh cuối trong Git Bash (chỉ hướng dẫn; agent không chạy phần stage/commit/push):

```bash
git status --short
git diff --check
git diff --cached --check
docker compose config --quiet
docker compose ps
curl -fsS http://localhost:8080/api/ready
```

Sau khi đã review và muốn lưu riêng đợt tài liệu này:

```bash
git add README.md infrastructure/rabbitmq/README.md docs/test/FINAL_SUBMISSION_READINESS.md
git diff --cached --check
git diff --cached --stat
git commit -m "docs: verify CAB submission readiness"
git status --short
git log -1 --oneline
```

Chỉ khi chính người dùng muốn gửi lên remote sau khi kiểm tra cảnh báo và quyền truy cập:

```bash
git push origin main
```

**Kết luận: READY WITH WARNINGS cho bài nộp/demo MSA hiện tại. Không tự động commit/push và không mở thêm phạm vi tính năng.**
