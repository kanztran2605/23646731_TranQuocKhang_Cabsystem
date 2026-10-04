\set ON_ERROR_STOP on

-- ============================================================================
-- CAB System MVP deterministic seed
-- Demo credentials: c@c.com / 123, d@d.com / 123, a@a.com / 123
-- ============================================================================

\connect auth_db
INSERT INTO user_account (uid, email, pw_hash, role, s)
VALUES
  (1, 'c@c.com', crypt('123', gen_salt('bf', 10)), 'CUSTOMER', 'ACTIVE'),
  (2, 'd@d.com', crypt('123', gen_salt('bf', 10)), 'DRIVER', 'ACTIVE'),
  (3, 'd2@d.com', crypt('123', gen_salt('bf', 10)), 'DRIVER', 'ACTIVE'),
  (4, 'd3@d.com', crypt('123', gen_salt('bf', 10)), 'DRIVER', 'ACTIVE'),
  (5, 'd4@d.com', crypt('123', gen_salt('bf', 10)), 'DRIVER', 'ACTIVE'),
  (6, 'd5@d.com', crypt('123', gen_salt('bf', 10)), 'DRIVER', 'ACTIVE'),
  (7, 'a@a.com', crypt('123', gen_salt('bf', 10)), 'ADMIN', 'ACTIVE')
ON CONFLICT (uid) DO NOTHING;
SELECT setval(pg_get_serial_sequence('user_account','uid'), COALESCE((SELECT MAX(uid) FROM user_account),1), true);

\connect customer_db
INSERT INTO customer_profile (cid, uid, name, addr)
VALUES (1, 1, 'Customer Demo', 'HCMC')
ON CONFLICT (cid) DO NOTHING;
SELECT setval(pg_get_serial_sequence('customer_profile','cid'), COALESCE((SELECT MAX(cid) FROM customer_profile),1), true);

\connect driver_db
INSERT INTO driver (did, uid, ap, av)
VALUES
  (1, 2, 'APPROVED', 'AVAILABLE'),
  (2, 3, 'APPROVED', 'BUSY'),
  (3, 4, 'APPROVED', 'OFFLINE'),
  (4, 5, 'PENDING_APPROVAL', 'OFFLINE'),
  (5, 6, 'REJECTED', 'OFFLINE')
ON CONFLICT (did) DO NOTHING;

INSERT INTO driver_profile (did, name, lic_enc, key_ver)
VALUES
  (1, 'Driver Demo 1', 'v1:XRRaVPgwqhKUyCRK:ov7ApsSibrNDa5U=:XEUVHRbCydqL9q3T1ea2Qg==', 1),
  (2, 'Driver Demo 2', 'v1:9kSwJsV9YM+KmeF6:3Shr4YEQseGelPY=:FSk2GGjuUrXeO9zx/wDq1Q==', 1),
  (3, 'Driver Demo 3', 'v1:gYFsI6ND7muF/vi7:8FeiKRQb457fAHU=:WVQ5/PzPF9GdICnf9+Yp+A==', 1),
  (4, 'Driver Demo 4', 'v1:wbSpSgMexhTzzU3r:/DWfwQBE8sPdZF4=:MNbSKeN5fnXG27oW7USB5g==', 1),
  (5, 'Driver Demo 5', 'v1:35kmFbMCRyFadSKx:b3T9jbTqd4DXphk=:89yprzpfuEwcJ7mR0UwYGg==', 1)
ON CONFLICT (did) DO NOTHING;

INSERT INTO driver_location (did, lat, lng)
VALUES
  (1, 10.760000, 106.680000),
  (2, 10.760500, 106.680500),
  (3, 10.761000, 106.681000),
  (4, 10.761500, 106.681500),
  (5, 10.762000, 106.682000)
ON CONFLICT (did) DO NOTHING;

INSERT INTO vehicle (vid, did, vt, plate, brand, model, s)
VALUES
  (1, 1, 'CAR', '51A-001.01', 'Toyota', 'Vios', 'ACTIVE'),
  (2, 2, 'CAR', '51A-002.02', 'Toyota', 'Vios', 'ACTIVE'),
  (3, 3, 'CAR', '51A-003.03', 'Kia', 'Morning', 'ACTIVE'),
  (4, 4, 'CAR', '51A-004.04', 'Hyundai', 'Accent', 'ACTIVE'),
  (5, 5, 'CAR', '51A-005.05', 'Toyota', 'Vios', 'ACTIVE')
ON CONFLICT (vid) DO NOTHING;

INSERT INTO driver_application (appid, did, vid, s, rev_uid, rev_at)
VALUES
  (1, 1, 1, 'APPROVED', 7, CURRENT_TIMESTAMP),
  (2, 2, 2, 'APPROVED', 7, CURRENT_TIMESTAMP),
  (3, 3, 3, 'APPROVED', 7, CURRENT_TIMESTAMP),
  (4, 4, 4, 'PENDING_APPROVAL', NULL, NULL),
  (5, 5, 5, 'REJECTED', 7, CURRENT_TIMESTAMP)
ON CONFLICT (appid) DO NOTHING;

SELECT setval(pg_get_serial_sequence('driver','did'), COALESCE((SELECT MAX(did) FROM driver),1), true);
SELECT setval(pg_get_serial_sequence('vehicle','vid'), COALESCE((SELECT MAX(vid) FROM vehicle),1), true);
SELECT setval(pg_get_serial_sequence('driver_application','appid'), COALESCE((SELECT MAX(appid) FROM driver_application),1), true);

\connect booking_db
INSERT INTO booking (bid, cid, p_lat, p_lng, p_addr, d_lat, d_lng, d_addr, vt, s)
VALUES
  (1, 1, 10.760000, 106.680000, 'P1', 10.770000, 106.690000, 'D1', 'CAR', 'NO_DRIVER_FOUND'),
  (2, 1, 10.760100, 106.680100, 'P2', 10.771000, 106.691000, 'D2', 'CAR', 'NO_DRIVER_FOUND'),
  (3, 1, 10.760200, 106.680200, 'P3', 10.772000, 106.692000, 'D3', 'CAR', 'NO_DRIVER_FOUND'),
  (4, 1, 10.760300, 106.680300, 'P4', 10.773000, 106.693000, 'D4', 'CAR', 'NO_DRIVER_FOUND'),
  (5, 1, 10.760400, 106.680400, 'P5', 10.774000, 106.694000, 'D5', 'CAR', 'NO_DRIVER_FOUND')
ON CONFLICT (bid) DO NOTHING;
SELECT setval(pg_get_serial_sequence('booking','bid'), COALESCE((SELECT MAX(bid) FROM booking),1), true);

\connect payment_db
INSERT INTO payment (pid, bid, tid, cid, customer_uid, amt, eligible, s, ikey, paid_at)
VALUES
  (1, 1, NULL, 1, 1, 50000, FALSE, 'PENDING', NULL, NULL),
  (2, 2, NULL, 1, 1, 50000, FALSE, 'PENDING', NULL, NULL),
  (3, 3, NULL, 1, 1, 50000, FALSE, 'PENDING', NULL, NULL),
  (4, 4, NULL, 1, 1, 50000, FALSE, 'PENDING', NULL, NULL),
  (5, 5, NULL, 1, 1, 50000, FALSE, 'PENDING', NULL, NULL)
ON CONFLICT (pid) DO NOTHING;
SELECT setval(pg_get_serial_sequence('payment','pid'), COALESCE((SELECT MAX(pid) FROM payment),1), true);

-- trip_db and review_db intentionally start empty so the core smoke creates
-- Trip, TripLocation, Payment eligibility and Review in a deterministic flow.
