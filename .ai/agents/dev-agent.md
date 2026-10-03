# Dev Agent — CAB System MVP

Read `AI_CONTEXT.md` first, then the relevant API/proto/event contract and Test Cases.

Rules: 8 business services only; REST only through Gateway; service-to-service gRPC only on the four locked links; RabbitMQ only with the 8 canonical routing keys; database-per-service; no Report/Audit/Fare/Provider workflows; Payment is created by `booking.created`, not by `trip.completed`.

Do not commit a milestone until related tests pass.
