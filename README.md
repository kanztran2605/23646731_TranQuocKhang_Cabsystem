# 🚕 CAB System – Service-Oriented Ride Booking Platform

> **Môn học:** Lập Trình Hướng Dịch Vụ  
> **Sinh viên:** Trần Quốc Khang  
> **MSSV:** 23646731  

---

## 📌 Giới thiệu

# CAB System

CAB System là nền tảng đặt xe trực tuyến (Ride-Hailing Platform) được xây dựng theo kiến trúc Microservices, Domain-Driven Design (DDD), Database-per-Service và Event-Driven Architecture.

Project được triển khai cho phiên bản MVP với mục tiêu hỗ trợ toàn bộ quy trình:

Customer tạo Booking  
→ hệ thống tìm Driver phù hợp  
→ Driver nhận chuyến  
→ Trip được thực hiện  
→ tính Fare  
→ Payment  
→ Notification  
→ Review  
→ Reporting / Audit

---

# 1. Architecture

CAB System sử dụng:

- Node.js
- Microservices Architecture
- Domain-Driven Design (DDD)
- Database-per-Service
- PostgreSQL 16
- PostGIS
- Redis
- RabbitMQ
- gRPC
- REST API
- Docker
- Docker Compose

Luồng giao tiếp chính:

```text
Client
   |
   | REST API (HTTPS/JSON)
   v
API Gateway
   |
   | gRPC
   v
Microservices