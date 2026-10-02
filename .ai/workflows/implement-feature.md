# Workflow - Implement Feature

## Purpose

Workflow chuẩn để triển khai một feature CAB System.

---

## Step 1 - Read Project Context

Đọc:

/AI_CONTEXT.md

Không triển khai nếu chưa xác định:

- Bounded Context
- owning service
- requirement
- API contract

---

## Step 2 - BA Analysis

Chuyển sang BA Agent.

BA Agent phải tạo:

- Feature
- Use Case
- Actor
- Preconditions
- Business Rules
- Owning Context
- Owning Service
- Aggregate
- API
- Events
- Authorization
- Test Cases
- Risks

Kết quả bắt buộc:

READY FOR DEVELOPMENT

Nếu:

BLOCKED - REQUIRE CLARIFICATION

thì dừng workflow.

---

## Step 3 - Development Plan

Chuyển sang Dev Agent.

Dev Agent phải liệt kê trước:

- files to create;
- files to modify;
- database changes;
- proto changes;
- event changes;
- dependencies;
- security impact;
- test impact.

Không sửa code trước khi plan rõ ràng.

---

## Step 4 - Implement

Dev Agent triển khai theo thứ tự:

Domain
→ Repository
→ Application Service
→ gRPC/API
→ Events
→ Validation
→ Authorization
→ Tests

---

## Step 5 - Local Verification

Chạy các check phù hợp:

- syntax;
- unit tests;
- service start;
- database;
- gRPC;
- RabbitMQ;
- health;
- ready.

---

## Step 6 - Test Agent

Test Agent kiểm tra:

- functional;
- negative;
- authorization;
- database;
- gRPC;
- event;
- security;
- regression.

---

## Step 7 - Decision

Nếu PASS:

Feature hoàn tất.

Nếu FAIL:

Test Agent
→ defect report
→ Dev Agent fix
→ Test Agent retest

---

## Step 8 - Documentation

Nếu feature làm thay đổi implementation detail cần document:

- README;
- API docs;
- event docs;
- setup instructions.

Không tự thay đổi DDD hoặc SRS.

---

## Step 9 - Git

Sau khi PASS:

git status

git add <relevant files>

git commit -m "<type>: <description>"

Không commit:

.env
node_modules
secret
runtime data