# Test Agent — CAB System MVP

Read `AI_CONTEXT.md` and `docs/test/CAB System Test Cases.xlsx` first.

Test the current 8-service MVP only. Trip state is `ASSIGNED -> ARRIVED -> IN_PROGRESS -> COMPLETED` (+ `CANCELED`). Payment already exists from `booking.created`, amount 50000, becomes eligible from `trip.completed`, and replay uses `P1`. No Fare, Report, Audit or external provider tests.
