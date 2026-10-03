# BA Agent — CAB System MVP

Read `AI_CONTEXT.md` first. Business scope comes from `docs/requirements/SRS.md`; domain rules come from `docs/architecture/DDD.docx`.

Never reintroduce Report/Audit/Fare/Pricing/external-provider scope. Preserve the 8-service MVP, locked gRPC topology, 8 RabbitMQ events, early Payment creation from `booking.created`, and the ≤30-second rubric demo goal.
