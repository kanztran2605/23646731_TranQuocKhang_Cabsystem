# API Gateway

Public business APIs use `http://localhost:8080/api/v1`. The Gateway translates REST JSON to the eight current gRPC contracts, verifies HS256 tokens and expiry, enforces CUSTOMER/DRIVER/ADMIN roles, and passes actor/correlation context. Services enforce resource ownership and business invariants.

Routes follow `docs/api/*.yaml`: register/login; Customer detail; Driver OTP/register/pending/detail/nearby/approval/availability/location; vehicle types; Booking create/detail/history and Offer list/accept; Trip detail/by-booking/status/location/cancel; Payment detail/by-booking/pay/callback; Notifications; and Trip reviews. Public aliases map explicitly to proto fields; `vt` is a string such as `CAR`.

Customer and Driver registration use the documented orchestration: create an Account with Auth, then create the profile with Customer/Driver. Driver location updates return DriverLocation over gRPC, so Gateway fetches the Driver profile by user ID to assemble the documented REST Driver response.

Redis holds only per-IP rate counters with a ten-second TTL. The fourth request returns 429. Payment's `Idempotency-Key` (demo `P1`) is forwarded to Payment; Gateway retains no Booking/Payment idempotency data. Redis outages fail business requests with 503.

`/api/v1/health` returns `{"s":"UP"}` while the process is alive. `/api/v1/ready` requires Redis and all eight gRPC health checks to be UP, otherwise 503. `/api/v1/health/services` lists eight service names with UP/DOWN. Root health aliases support container probes. Health bypasses business rate limiting. Dependency checks run concurrently with a 1500 ms default bound and omit downstream error details.

A safe `X-Correlation-ID` or `X-Request-ID` is reused, otherwise a UUID is generated. Responses return `X-Correlation-ID`; downstream calls receive it in context and gRPC metadata. Logs omit query strings, request bodies and credentials.

## Validation

From the repository root, run `npm ci` to install shared runtime dependencies, then `npm install --prefix services/api-gateway` to install Gateway dependencies. Shared modules resolve packages from the root `node_modules` using normal Node resolution. Docker retains its existing installation at `/app/node_modules`, which both shared modules and the Gateway can resolve. No `NODE_PATH` override is needed.

Run:

- `npm test` in this directory
- `node --test shared/tests/*.test.js` from the repository root

Tests use current proto serializers and isolated gRPC/Redis doubles; client tests also run a local gRPC server. They verify transport independently of downstream business readiness.

All eight downstream services implement their current proto operations and HealthService.Check. They enforce ownership and business invariants; the final full-stack results are recorded in `docs/test/FINAL_IMPLEMENTATION_VALIDATION.md`.

Gateway returns mapped downstream failures without synthesizing domain results. Registration uses two independent service transactions; if profile creation fails after Account creation, the failure is surfaced and requires local inspection. The MVP has no automatic recovery framework.
