# Redis

Redis belongs only to API Gateway infrastructure.

It may hold rate-limit counters and short-lived cache or token revocation state.

Redis must not hold domain source-of-truth data, including Booking, Driver, Trip,
Payment, Review, or Notification data.

The demo rate limit is **3 requests / 10 seconds**. Requests above that limit
receive HTTP 429.
