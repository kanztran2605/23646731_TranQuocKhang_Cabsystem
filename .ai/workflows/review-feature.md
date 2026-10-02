# Workflow - Review Feature

## Purpose

Dùng để review feature đã được implement trước khi merge/commit milestone.

---

## 1. Requirement Review

BA Agent kiểm:

- đúng Use Case;
- đúng Actor;
- đúng business rule;
- đúng Aggregate;
- đúng service ownership;
- không có requirement drift.

---

## 2. Architecture Review

Kiểm:

- đúng microservice;
- đúng database;
- không cross-database query;
- không physical FK xuyên service;
- synchronous communication đúng gRPC;
- asynchronous communication đúng RabbitMQ;
- không bypass Gateway.

---

## 3. Code Review

Dev Agent kiểm:

- business logic không nằm trong transport layer;
- repository chỉ persistence;
- validation đầy đủ;
- errors thống nhất;
- logging có correlationId;
- không hard-code secret;
- code dễ test.

---

## 4. Security Review

Kiểm:

- authentication;
- authorization;
- ownership;
- input validation;
- SQL injection;
- XSS;
- secret handling;
- sensitive logging;
- replay/idempotency nếu áp dụng.

---

## 5. Event Review

Nếu có RabbitMQ:

- routing key đúng;
- producer đúng;
- consumer đúng;
- payload đúng;
- envelope đúng;
- publish timing đúng;
- consumer idempotent.

---

## 6. Database Review

Kiểm:

- đúng DB ownership;
- constraint đúng;
- unique constraint nếu cần;
- index nếu cần;
- transaction boundary đúng.

---

## 7. Test Review

Test Agent xác nhận:

- happy path;
- negative;
- boundary;
- role;
- database;
- event;
- security;
- regression.

---

## 8. Review Result

Kết luận một trong:

APPROVED

APPROVED WITH MINOR NOTES

CHANGES REQUIRED

BLOCKED