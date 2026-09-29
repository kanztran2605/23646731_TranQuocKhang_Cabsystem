# 🚕 CAB System – Service-Oriented Ride Booking Platform

> **Môn học:** Lập Trình Hướng Dịch Vụ  
> **Sinh viên:** Trần Quốc Khang  
> **MSSV:** 23646731  

---

## 📌 Giới thiệu

**CAB System** là hệ thống đặt xe trực tuyến được xây dựng theo định hướng **Service-Oriented Architecture / Microservices**.

Hệ thống hỗ trợ toàn bộ quy trình nghiệp vụ từ khi Customer tạo yêu cầu đặt xe cho đến khi chuyến đi hoàn thành, thanh toán và đánh giá Driver.

Mục tiêu chính của hệ thống:

- Tự động tìm kiếm và phân công Driver phù hợp.
- Cho phép Customer đặt xe và theo dõi trạng thái chuyến đi.
- Cho phép Driver quản lý trạng thái hoạt động và thực hiện chuyến.
- Hỗ trợ thanh toán tiền mặt và thanh toán điện tử.
- Hỗ trợ thông báo cho Customer và Driver.
- Hỗ trợ đánh giá Driver sau chuyến đi.
- Cung cấp chức năng quản lý và giám sát cho Operation Staff.
- Đảm bảo Authentication, Authorization và các yêu cầu bảo mật.
- Có khả năng mở rộng độc lập giữa các thành phần.

---

## 🎯 Business Flow chính

```text
Customer
   │
   ▼
Đăng ký / Đăng nhập
   │
   ▼
Tạo yêu cầu đặt xe
   │
   ▼
Tìm Driver phù hợp
   │
   ▼
Driver nhận chuyến
   │
   ▼
Driver đến điểm đón
   │
   ▼
Đón Customer
   │
   ▼
Đang thực hiện chuyến
   │
   ▼
Hoàn thành chuyến
   │
   ▼
Tính cước
   │
   ▼
Thanh toán
   │
   ▼
Đánh giá Driver