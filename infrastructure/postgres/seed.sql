\set ON_ERROR_STOP on

-- CAB System local/demo seed data.
--
-- Purpose:
-- - deterministic demo data
-- - prepare data for teacher's Postman rubric
-- - at least 5 Drivers with different states
-- - at least 5 Bookings for Customer
--
-- Passwords are stored only as BCrypt hashes in auth_db.
-- Cross-context IDs remain logical references.


-- =========================================================
-- auth_db
-- =========================================================

\connect auth_db


INSERT INTO role (
    role_id,
    role_name,
    description
) VALUES
    (
        1,
        'CUSTOMER',
        'Customer using CAB System to book and manage rides'
    ),
    (
        2,
        'DRIVER',
        'Driver providing transportation services'
    ),
    (
        3,
        'OPERATION_STAFF',
        'Operations staff managing day-to-day platform operations'
    ),
    (
        4,
        'MANAGEMENT',
        'Management role with reporting access'
    ),
    (
        5,
        'SYSTEM_ADMINISTRATOR',
        'System administrator for privileged platform administration'
    )
ON CONFLICT DO NOTHING;


INSERT INTO permission (
    permission_id,
    permission_code,
    description
) VALUES
    (
        1,
        'PROFILE_READ_SELF',
        'Read own profile'
    ),
    (
        2,
        'PROFILE_UPDATE_SELF',
        'Update own profile'
    ),
    (
        3,
        'BOOKING_CREATE',
        'Create a booking'
    ),
    (
        4,
        'BOOKING_READ_SELF',
        'Read own bookings'
    ),
    (
        5,
        'TRIP_READ_SELF',
        'Read own or assigned trip'
    ),
    (
        6,
        'TRIP_CANCEL_SELF',
        'Cancel an eligible customer trip'
    ),
    (
        7,
        'PAYMENT_CREATE_SELF',
        'Create payment for own completed trip'
    ),
    (
        8,
        'REVIEW_CREATE_SELF',
        'Create review for own completed trip'
    ),
    (
        9,
        'NOTIFICATION_READ_SELF',
        'Read own notifications'
    ),
    (
        10,
        'DRIVER_AVAILABILITY_UPDATE_SELF',
        'Update own driver availability'
    ),
    (
        11,
        'DRIVER_LOCATION_UPDATE_SELF',
        'Update own driver location'
    ),
    (
        12,
        'DRIVER_OFFER_RESPOND_SELF',
        'Accept or reject own driver offer'
    ),
    (
        13,
        'TRIP_STATUS_UPDATE_ASSIGNED',
        'Update status of assigned trip'
    ),
    (
        14,
        'CUSTOMER_READ',
        'Read customer information for operations'
    ),
    (
        15,
        'DRIVER_MANAGE',
        'Read and manage driver profiles'
    ),
    (
        16,
        'DRIVER_APPROVE',
        'Approve or reject driver applications'
    ),
    (
        17,
        'VEHICLE_MANAGE',
        'Manage driver vehicles'
    ),
    (
        18,
        'TRIP_OPERATE',
        'Monitor and resolve trip operational issues'
    ),
    (
        19,
        'PAYMENT_TRANSACTION_READ',
        'Read payment transaction information'
    ),
    (
        20,
        'REPORT_READ',
        'Read management reports'
    ),
    (
        21,
        'AUDIT_READ',
        'Read audit logs'
    ),
    (
        22,
        'ROLE_MANAGE',
        'Read roles and update role permissions'
    )
ON CONFLICT DO NOTHING;


INSERT INTO role_permission (
    role_id,
    permission_id
) VALUES

    -- CUSTOMER
    (1,1),
    (1,2),
    (1,3),
    (1,4),
    (1,5),
    (1,6),
    (1,7),
    (1,8),
    (1,9),

    -- DRIVER
    (2,1),
    (2,2),
    (2,5),
    (2,9),
    (2,10),
    (2,11),
    (2,12),
    (2,13),

    -- OPERATION_STAFF
    (3,14),
    (3,15),
    (3,16),
    (3,17),
    (3,18),
    (3,19),
    (3,20),
    (3,21),
    (3,22),

    -- MANAGEMENT
    (4,20),

    -- SYSTEM_ADMINISTRATOR
    (5,14),
    (5,15),
    (5,16),
    (5,17),
    (5,18),
    (5,19),
    (5,20),
    (5,21),
    (5,22)

ON CONFLICT DO NOTHING;


INSERT INTO user_account (
    user_id,
    phone,
    email,
    password_hash,
    role_id,
    status,
    created_at
) VALUES

    (
        1,
        '0901000001',
        'customer@example.com',
        '$2b$12$gHMmiaocTaGEm4pL7y1Bke7rk1hEy04K6/YbvneWPTTSrIlUQtEgi',
        1,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '60 days'
    ),

    (
        2,
        '0902000001',
        'driver1@example.com',
        '$2b$12$9ES3BzfCo4JO7yiU7TH4AuAdQMa8uOy9UUseq0dYytmuL8ow6/MD.',
        2,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '50 days'
    ),

    (
        3,
        '0902000002',
        'driver2@example.com',
        '$2b$12$9ES3BzfCo4JO7yiU7TH4AuAdQMa8uOy9UUseq0dYytmuL8ow6/MD.',
        2,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '49 days'
    ),

    (
        4,
        '0902000003',
        'driver3@example.com',
        '$2b$12$9ES3BzfCo4JO7yiU7TH4AuAdQMa8uOy9UUseq0dYytmuL8ow6/MD.',
        2,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '48 days'
    ),

    (
        5,
        '0902000004',
        'driver4@example.com',
        '$2b$12$9ES3BzfCo4JO7yiU7TH4AuAdQMa8uOy9UUseq0dYytmuL8ow6/MD.',
        2,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '47 days'
    ),

    (
        6,
        '0902000005',
        'driver5@example.com',
        '$2b$12$9ES3BzfCo4JO7yiU7TH4AuAdQMa8uOy9UUseq0dYytmuL8ow6/MD.',
        2,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '2 days'
    ),

    (
        7,
        '0902000006',
        'driver6@example.com',
        '$2b$12$9ES3BzfCo4JO7yiU7TH4AuAdQMa8uOy9UUseq0dYytmuL8ow6/MD.',
        2,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '20 days'
    ),

    (
        8,
        '0903000001',
        'ops@example.com',
        '$2b$12$KYKsodxCY6hXqSZw1qnO4uEUGA/JLHzNECiiycv9R4o.t0b3VNKkq',
        3,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '90 days'
    ),

    (
        9,
        '0904000001',
        'management@example.com',
        '$2b$12$QX8Sb5u.Hl5RVSyrDy1knOQW5VX9IXmD7xLbVQpkbOM4Ap4NrsNiy',
        4,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '90 days'
    ),

    (
        10,
        '0905000001',
        'admin@example.com',
        '$2b$12$R.HWSWqiboHKjMPKh.e6l.PbzTDW7jf8Tiday2NWwLBx6F/2YfnZO',
        5,
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '90 days'
    )

ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'role',
        'role_id'
    ),
    (
        SELECT MAX(role_id)
        FROM role
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'permission',
        'permission_id'
    ),
    (
        SELECT MAX(permission_id)
        FROM permission
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'user_account',
        'user_id'
    ),
    (
        SELECT MAX(user_id)
        FROM user_account
    ),
    true
);



-- =========================================================
-- customer_db
-- =========================================================

\connect customer_db


INSERT INTO customer_profile (
    customer_id,
    user_id,
    full_name,
    address,
    date_of_birth,
    created_at
) VALUES (
    1,
    1,
    'Nguyen Van Customer',
    'Go Vap, Ho Chi Minh City',
    DATE '2004-05-20',
    CURRENT_TIMESTAMP - INTERVAL '60 days'
)
ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'customer_profile',
        'customer_id'
    ),
    (
        SELECT MAX(customer_id)
        FROM customer_profile
    ),
    true
);



-- =========================================================
-- driver_db
--
-- Center prepared for nearby Driver rubric:
-- lat = 10.8231
-- lng = 106.6297
-- radius = 1 km
-- =========================================================

\connect driver_db


INSERT INTO vehicle_type (
    vehicle_type_id,
    name,
    description,
    status
) VALUES
    (
        1,
        'Car 4 seats',
        'Standard 4-seat car service',
        'ACTIVE'
    ),
    (
        2,
        'Car 7 seats',
        'Standard 7-seat car service',
        'ACTIVE'
    ),
    (
        3,
        'Motorbike',
        'Motorbike ride service',
        'ACTIVE'
    )
ON CONFLICT DO NOTHING;


INSERT INTO driver (
    driver_id,
    user_id,
    approval_status,
    availability_status,
    created_at
) VALUES

    (
        1,
        2,
        'APPROVED',
        'AVAILABLE',
        CURRENT_TIMESTAMP - INTERVAL '50 days'
    ),

    (
        2,
        3,
        'APPROVED',
        'AVAILABLE',
        CURRENT_TIMESTAMP - INTERVAL '49 days'
    ),

    (
        3,
        4,
        'APPROVED',
        'BUSY',
        CURRENT_TIMESTAMP - INTERVAL '48 days'
    ),

    (
        4,
        5,
        'APPROVED',
        'OFFLINE',
        CURRENT_TIMESTAMP - INTERVAL '47 days'
    ),

    (
        5,
        6,
        'PENDING_APPROVAL',
        'OFFLINE',
        CURRENT_TIMESTAMP - INTERVAL '2 days'
    ),

    (
        6,
        7,
        'REJECTED',
        'OFFLINE',
        CURRENT_TIMESTAMP - INTERVAL '20 days'
    )

ON CONFLICT DO NOTHING;


-- These seed values are intentionally opaque.
-- Real create/update Driver flows must encrypt Driver License
-- in driver-service using DATA_ENCRYPTION_KEY.

INSERT INTO driver_profile (
    driver_id,
    full_name,
    address,
    date_of_birth,
    driver_license_ciphertext,
    encryption_key_version
) VALUES

    (
        1,
        'Tran Van Driver 1',
        'Go Vap, Ho Chi Minh City',
        DATE '1995-03-10',
        'enc:v1:8b9f0d5d7c2a4e7f91a2b3c4d5e6f701',
        1
    ),

    (
        2,
        'Tran Van Driver 2',
        'Go Vap, Ho Chi Minh City',
        DATE '1993-07-21',
        'enc:v1:4c7d2e9a6b1f8d305e4a7c9b2d6f1038',
        1
    ),

    (
        3,
        'Tran Van Driver 3',
        'Tan Binh, Ho Chi Minh City',
        DATE '1990-12-05',
        'enc:v1:1a6e3c8f9b2d7045c7e1f8a3d6b9024c',
        1
    ),

    (
        4,
        'Tran Van Driver 4',
        'District 12, Ho Chi Minh City',
        DATE '1992-09-14',
        'enc:v1:7f2b4d9a1c6e8035b8a4d2f9c1e50763',
        1
    ),

    (
        5,
        'Tran Van Driver 5',
        'Go Vap, Ho Chi Minh City',
        DATE '1998-04-18',
        'enc:v1:3d8a5c1e7f2b9046a1d9c5e8b3f70214',
        1
    ),

    (
        6,
        'Tran Van Driver 6',
        'Go Vap, Ho Chi Minh City',
        DATE '1996-11-30',
        'enc:v1:9c1e4a7d2b6f8035e8d3a1c7f5b90246',
        1
    )

ON CONFLICT DO NOTHING;


INSERT INTO vehicle (
    vehicle_id,
    driver_id,
    vehicle_type_id,
    license_plate,
    brand,
    model,
    status
) VALUES

    (
        1,
        1,
        1,
        '51A-100.01',
        'Toyota',
        'Vios',
        'ACTIVE'
    ),

    (
        2,
        2,
        1,
        '51A-100.02',
        'Honda',
        'City',
        'ACTIVE'
    ),

    (
        3,
        3,
        1,
        '51A-100.03',
        'Hyundai',
        'Accent',
        'ACTIVE'
    ),

    (
        4,
        4,
        2,
        '51A-100.04',
        'Toyota',
        'Innova',
        'ACTIVE'
    ),

    (
        5,
        5,
        1,
        '51A-100.05',
        'Kia',
        'Soluto',
        'ACTIVE'
    ),

    (
        6,
        6,
        1,
        '51A-100.06',
        'Mazda',
        'Mazda 2',
        'ACTIVE'
    )

ON CONFLICT DO NOTHING;


INSERT INTO driver_location (
    driver_id,
    latitude,
    longitude,
    recorded_at
) VALUES

    (
        1,
        10.823200,
        106.629800,
        CURRENT_TIMESTAMP - INTERVAL '15 seconds'
    ),

    (
        2,
        10.824000,
        106.630200,
        CURRENT_TIMESTAMP - INTERVAL '20 seconds'
    ),

    (
        3,
        10.821800,
        106.628800,
        CURRENT_TIMESTAMP - INTERVAL '25 seconds'
    ),

    (
        4,
        10.825000,
        106.632000,
        CURRENT_TIMESTAMP - INTERVAL '30 seconds'
    ),

    (
        5,
        10.819800,
        106.626500,
        CURRENT_TIMESTAMP - INTERVAL '35 seconds'
    ),

    (
        6,
        10.829000,
        106.633000,
        CURRENT_TIMESTAMP - INTERVAL '40 seconds'
    )

ON CONFLICT DO NOTHING;


INSERT INTO driver_application (
    application_id,
    driver_id,
    vehicle_id,
    status,
    reviewed_by_user_id,
    rejection_reason,
    submitted_at,
    reviewed_at
) VALUES

    (
        1,
        1,
        1,
        'APPROVED',
        10,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '50 days',
        CURRENT_TIMESTAMP - INTERVAL '49 days'
    ),

    (
        2,
        5,
        5,
        'PENDING_APPROVAL',
        NULL,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 days',
        NULL
    ),

    (
        3,
        6,
        6,
        'REJECTED',
        8,
        'Demo seed: application rejected during verification',
        CURRENT_TIMESTAMP - INTERVAL '20 days',
        CURRENT_TIMESTAMP - INTERVAL '19 days'
    )

ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'vehicle_type',
        'vehicle_type_id'
    ),
    (
        SELECT MAX(vehicle_type_id)
        FROM vehicle_type
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'driver',
        'driver_id'
    ),
    (
        SELECT MAX(driver_id)
        FROM driver
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'vehicle',
        'vehicle_id'
    ),
    (
        SELECT MAX(vehicle_id)
        FROM vehicle
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'driver_application',
        'application_id'
    ),
    (
        SELECT MAX(application_id)
        FROM driver_application
    ),
    true
);



-- =========================================================
-- booking_db
--
-- At least 5 bookings for the seeded Customer.
-- =========================================================

\connect booking_db


INSERT INTO booking (
    booking_id,
    customer_id,

    pickup_latitude,
    pickup_longitude,
    pickup_address,

    destination_latitude,
    destination_longitude,
    destination_address,

    requested_vehicle_type_id,

    status,
    created_at
) VALUES

    (
        1,
        1,

        10.823100,
        106.629700,
        'Go Vap, Ho Chi Minh City',

        10.776900,
        106.700900,
        'District 1, Ho Chi Minh City',

        1,

        'SEARCHING',
        CURRENT_TIMESTAMP - INTERVAL '2 minutes'
    ),

    (
        2,
        1,

        10.823100,
        106.629700,
        'Go Vap, Ho Chi Minh City',

        10.801000,
        106.652000,
        'Phu Nhuan, Ho Chi Minh City',

        1,

        'ASSIGNED',
        CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    ),

    (
        3,
        1,

        10.823100,
        106.629700,
        'Go Vap, Ho Chi Minh City',

        10.850000,
        106.650000,
        'District 12, Ho Chi Minh City',

        1,

        'NO_DRIVER_FOUND',
        CURRENT_TIMESTAMP - INTERVAL '3 days'
    ),

    (
        4,
        1,

        10.823100,
        106.629700,
        'Go Vap, Ho Chi Minh City',

        10.775600,
        106.700400,
        'Ben Thanh, District 1, Ho Chi Minh City',

        1,

        'ASSIGNED',
        CURRENT_TIMESTAMP - INTERVAL '2 days 2 hours'
    ),

    (
        5,
        1,

        10.823100,
        106.629700,
        'Go Vap, Ho Chi Minh City',

        10.790000,
        106.680000,
        'Binh Thanh, Ho Chi Minh City',

        2,

        'ASSIGNED',
        CURRENT_TIMESTAMP - INTERVAL '1 day 2 hours'
    )

ON CONFLICT DO NOTHING;


INSERT INTO driver_offer (
    offer_id,
    booking_id,
    driver_id,
    vehicle_id,
    status,
    expires_at,
    responded_at,
    created_at
) VALUES

    (
        1,
        1,
        2,
        2,
        'PENDING',
        CURRENT_TIMESTAMP + INTERVAL '5 minutes',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '1 minute'
    ),

    (
        2,
        2,
        3,
        3,
        'ACCEPTED',
        CURRENT_TIMESTAMP - INTERVAL '14 minutes',
        CURRENT_TIMESTAMP - INTERVAL '14 minutes 30 seconds',
        CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    ),

    (
        3,
        3,
        1,
        1,
        'EXPIRED',
        CURRENT_TIMESTAMP - INTERVAL '3 days',
        CURRENT_TIMESTAMP - INTERVAL '3 days',
        CURRENT_TIMESTAMP - INTERVAL '3 days 1 minute'
    ),

    (
        4,
        4,
        1,
        1,
        'ACCEPTED',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 58 minutes',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 59 minutes',
        CURRENT_TIMESTAMP - INTERVAL '2 days 2 hours'
    ),

    (
        5,
        5,
        4,
        4,
        'ACCEPTED',
        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 58 minutes',
        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 59 minutes',
        CURRENT_TIMESTAMP - INTERVAL '1 day 2 hours'
    )

ON CONFLICT DO NOTHING;


INSERT INTO driver_assignment (
    assignment_id,
    booking_id,
    offer_id,
    driver_id,
    vehicle_id,
    assigned_at
) VALUES

    (
        1,
        2,
        2,
        3,
        3,
        CURRENT_TIMESTAMP - INTERVAL '14 minutes'
    ),

    (
        2,
        4,
        4,
        1,
        1,
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 59 minutes'
    ),

    (
        3,
        5,
        5,
        4,
        4,
        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 59 minutes'
    )

ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'booking',
        'booking_id'
    ),
    (
        SELECT MAX(booking_id)
        FROM booking
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'driver_offer',
        'offer_id'
    ),
    (
        SELECT MAX(offer_id)
        FROM driver_offer
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'driver_assignment',
        'assignment_id'
    ),
    (
        SELECT MAX(assignment_id)
        FROM driver_assignment
    ),
    true
);



-- =========================================================
-- trip_db
-- =========================================================

\connect trip_db


INSERT INTO trip (
    trip_id,
    booking_id,
    customer_id,
    driver_id,
    vehicle_id,
    vehicle_type_id,

    distance_km,
    status,
    estimated_arrival_at,

    assigned_at,
    arrived_at,
    picked_up_at,
    started_at,

    completed_at,

    canceled_at,
    cancel_reason,
    canceled_by_user_id
) VALUES

    -- Active assigned Trip.
    -- Driver 3 is BUSY in driver_db.
    (
        1,
        2,
        1,
        3,
        3,
        1,

        NULL,
        'ASSIGNED',
        CURRENT_TIMESTAMP + INTERVAL '5 minutes',

        CURRENT_TIMESTAMP - INTERVAL '14 minutes',
        NULL,
        NULL,
        NULL,

        NULL,

        NULL,
        NULL,
        NULL
    ),

    -- Historical completed Trip.
    (
        2,
        4,
        1,
        1,
        1,
        1,

        8.40,
        'COMPLETED',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 50 minutes',

        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 59 minutes',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 50 minutes',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 48 minutes',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 47 minutes',

        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 20 minutes',

        NULL,
        NULL,
        NULL
    ),

    -- Historical canceled Trip.
    (
        3,
        5,
        1,
        4,
        4,
        2,

        NULL,
        'CANCELED',
        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 50 minutes',

        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 59 minutes',
        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 50 minutes',
        NULL,
        NULL,

        NULL,

        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 45 minutes',
        'Customer changed plan',
        1
    )

ON CONFLICT DO NOTHING;


INSERT INTO trip_status_history (
    history_id,
    trip_id,
    from_status,
    to_status,
    changed_by_user_id,
    reason,
    changed_at
) VALUES

    (
        1,
        1,
        NULL,
        'ASSIGNED',
        NULL,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '14 minutes'
    ),

    (
        2,
        2,
        NULL,
        'ASSIGNED',
        NULL,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 59 minutes'
    ),

    (
        3,
        2,
        'ASSIGNED',
        'ARRIVED',
        2,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 50 minutes'
    ),

    (
        4,
        2,
        'ARRIVED',
        'PICKED_UP',
        2,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 48 minutes'
    ),

    (
        5,
        2,
        'PICKED_UP',
        'IN_PROGRESS',
        2,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 47 minutes'
    ),

    (
        6,
        2,
        'IN_PROGRESS',
        'COMPLETED',
        2,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 20 minutes'
    ),

    (
        7,
        3,
        NULL,
        'ASSIGNED',
        NULL,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 59 minutes'
    ),

    (
        8,
        3,
        'ASSIGNED',
        'ARRIVED',
        5,
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 50 minutes'
    ),

    (
        9,
        3,
        'ARRIVED',
        'CANCELED',
        1,
        'Customer changed plan',
        CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour 45 minutes'
    )

ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'trip',
        'trip_id'
    ),
    (
        SELECT MAX(trip_id)
        FROM trip
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'trip_status_history',
        'history_id'
    ),
    (
        SELECT MAX(history_id)
        FROM trip_status_history
    ),
    true
);



-- =========================================================
-- payment_db
--
-- Fare belongs to completed Trip 2.
-- Payment Aggregate contains multiple provider attempts.
-- =========================================================

\connect payment_db


INSERT INTO fare (
    fare_id,
    trip_id,
    vehicle_type_id,
    amount,
    currency,
    pricing_data,
    pricing_policy_snapshot,
    calculated_at
) VALUES (
    1,
    2,
    1,
    115800.00,
    'VND',

    '{
        "baseFare": 15000,
        "distanceFare": 100800,
        "minimumFare": 20000,
        "finalFare": 115800
    }',

    '{
        "vehicleTypeId": "1",
        "baseFare": 15000,
        "perKmRate": 12000,
        "minimumFare": 20000,
        "currency": "VND",
        "version": "1"
    }',

    CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 19 minutes'
)
ON CONFLICT DO NOTHING;


INSERT INTO payment (
    payment_id,
    fare_id,
    trip_id,
    customer_id,

    amount,
    currency,

    payment_method,
    payment_status,

    idempotency_key,

    provider_reference,
    failure_reason,
    paid_at
) VALUES (
    1,
    1,
    2,
    1,

    115800.00,
    'VND',

    'ELECTRONIC',
    'COMPLETED',

    'PAY-TRIP2-DEMO-001',

    'MOCK-TXN-0001',
    NULL,

    CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 15 minutes'
)
ON CONFLICT DO NOTHING;


INSERT INTO payment_transaction (
    transaction_id,
    payment_id,
    provider_reference,
    transaction_status,
    amount,
    currency,
    failure_reason,
    processed_at
) VALUES

    (
        1,
        1,
        'MOCK-DECLINED-0001',
        'FAILED',
        115800.00,
        'VND',
        'PROVIDER_DECLINED',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 18 minutes'
    ),

    (
        2,
        1,
        'MOCK-TXN-0001',
        'COMPLETED',
        115800.00,
        'VND',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 15 minutes'
    )

ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'fare',
        'fare_id'
    ),
    (
        SELECT MAX(fare_id)
        FROM fare
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'payment',
        'payment_id'
    ),
    (
        SELECT MAX(payment_id)
        FROM payment
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'payment_transaction',
        'transaction_id'
    ),
    (
        SELECT MAX(transaction_id)
        FROM payment_transaction
    ),
    true
);



-- =========================================================
-- notification_db
-- =========================================================

\connect notification_db


INSERT INTO notification (
    notification_id,
    source_event_id,
    dedup_key,
    recipient_user_id,
    notification_type,
    notification_status,
    message,
    created_at
) VALUES

    (
        1,
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111:1:BOOKING_CREATED',
        1,
        'BOOKING_CREATED',
        'PROCESSED',
        'Your booking has been received and driver matching has started.',
        CURRENT_TIMESTAMP - INTERVAL '2 minutes'
    ),

    (
        2,
        '22222222-2222-4222-8222-222222222222',
        '22222222-2222-4222-8222-222222222222:3:DRIVER_OFFER_CREATED',
        3,
        'DRIVER_OFFER_CREATED',
        'PROCESSED',
        'A new driver offer is available.',
        CURRENT_TIMESTAMP - INTERVAL '1 minute'
    ),

    (
        3,
        '33333333-3333-4333-8333-333333333333',
        '33333333-3333-4333-8333-333333333333:1:DRIVER_ASSIGNED',
        1,
        'DRIVER_ASSIGNED',
        'PROCESSED',
        'A driver has accepted your booking.',
        CURRENT_TIMESTAMP - INTERVAL '14 minutes'
    ),

    (
        4,
        '44444444-4444-4444-8444-444444444444',
        '44444444-4444-4444-8444-444444444444:1:PAYMENT_COMPLETED',
        1,
        'PAYMENT_COMPLETED',
        'PROCESSED',
        'Payment completed successfully.',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 15 minutes'
    )

ON CONFLICT DO NOTHING;


INSERT INTO notification_delivery (
    delivery_id,
    notification_id,
    channel,
    provider,
    delivery_status,
    attempt_count,
    provider_message_id,
    failure_reason,
    sent_at,
    delivered_at
) VALUES

    (
        1,
        1,
        'PUSH',
        'MOCK',
        'DELIVERED',
        1,
        'MSG-0001',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 minutes',
        CURRENT_TIMESTAMP - INTERVAL '1 minute 58 seconds'
    ),

    (
        2,
        2,
        'PUSH',
        'MOCK',
        'DELIVERED',
        1,
        'MSG-0002',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '1 minute',
        CURRENT_TIMESTAMP - INTERVAL '58 seconds'
    ),

    (
        3,
        3,
        'PUSH',
        'MOCK',
        'DELIVERED',
        1,
        'MSG-0003',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '14 minutes',
        CURRENT_TIMESTAMP - INTERVAL '13 minutes 58 seconds'
    ),

    (
        4,
        4,
        'EMAIL',
        'MOCK',
        'DELIVERED',
        1,
        'MSG-0004',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 15 minutes',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 14 minutes'
    )

ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'notification',
        'notification_id'
    ),
    (
        SELECT MAX(notification_id)
        FROM notification
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'notification_delivery',
        'delivery_id'
    ),
    (
        SELECT MAX(delivery_id)
        FROM notification_delivery
    ),
    true
);



-- =========================================================
-- review_db
-- =========================================================

\connect review_db


INSERT INTO review (
    review_id,
    trip_id,
    customer_id,
    driver_id,
    score,
    comment,
    created_at
) VALUES (
    1,
    2,
    1,
    1,
    5,
    'Good trip and professional driver.',
    CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour'
)
ON CONFLICT DO NOTHING;


INSERT INTO driver_rating (
    driver_id,
    average_score,
    review_count,
    updated_at
) VALUES (
    1,
    5.00,
    1,
    CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour'
)
ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'review',
        'review_id'
    ),
    (
        SELECT MAX(review_id)
        FROM review
    ),
    true
);



-- =========================================================
-- reporting_db
--
-- Read-model seed for last 30 days.
-- =========================================================

\connect reporting_db


INSERT INTO trip_report (
    report_id,
    period_start,
    period_end,
    trip_count,
    completed_count,
    canceled_count,
    completion_rate,
    cancelation_rate,
    generated_at
) VALUES (
    1,
    CURRENT_DATE - 30,
    CURRENT_DATE,
    3,
    1,
    1,
    0.33,
    0.33,
    CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;


INSERT INTO revenue_report (
    report_id,
    period_start,
    period_end,
    total_revenue,
    currency,
    successful_payment_count,
    failed_payment_count,
    generated_at
) VALUES (
    1,
    CURRENT_DATE - 30,
    CURRENT_DATE,
    115800.00,
    'VND',
    1,
    0,
    CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;


INSERT INTO driver_performance (
    performance_id,
    driver_id,
    period_start,
    period_end,
    trip_count,
    completed_count,
    canceled_count,
    completion_rate,
    cancelation_rate,
    rating,
    updated_at
) VALUES

    (
        1,
        1,
        CURRENT_DATE - 30,
        CURRENT_DATE,
        1,
        1,
        0,
        1.00,
        0.00,
        5.00,
        CURRENT_TIMESTAMP
    ),

    (
        2,
        3,
        CURRENT_DATE - 30,
        CURRENT_DATE,
        1,
        0,
        0,
        0.00,
        0.00,
        4.50,
        CURRENT_TIMESTAMP
    ),

    (
        3,
        4,
        CURRENT_DATE - 30,
        CURRENT_DATE,
        1,
        0,
        1,
        0.00,
        1.00,
        4.20,
        CURRENT_TIMESTAMP
    )

ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'trip_report',
        'report_id'
    ),
    (
        SELECT MAX(report_id)
        FROM trip_report
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'revenue_report',
        'report_id'
    ),
    (
        SELECT MAX(report_id)
        FROM revenue_report
    ),
    true
);


SELECT setval(
    pg_get_serial_sequence(
        'driver_performance',
        'performance_id'
    ),
    (
        SELECT MAX(performance_id)
        FROM driver_performance
    ),
    true
);



-- =========================================================
-- audit_db
-- =========================================================

\connect audit_db


INSERT INTO audit_log (
    audit_id,
    event_id,
    correlation_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    success,
    ip_address,
    metadata,
    created_at
) VALUES

    (
        1,
        NULL,
        'seed-admin-driver-approval',
        10,
        'DRIVER_APPROVED',
        'DRIVER',
        '1',
        TRUE,
        '127.0.0.1',
        '{
            "source": "seed",
            "approvalStatus": "APPROVED"
        }',
        CURRENT_TIMESTAMP - INTERVAL '49 days'
    ),

    (
        2,
        '55555555-5555-4555-8555-555555555555',
        'seed-no-driver-found',
        NULL,
        'BOOKING_NO_DRIVER_FOUND',
        'BOOKING',
        '3',
        TRUE,
        NULL,
        '{
            "reason": "NO_SUITABLE_DRIVER"
        }',
        CURRENT_TIMESTAMP - INTERVAL '3 days'
    ),

    (
        3,
        '44444444-4444-4444-8444-444444444444',
        'seed-payment-completed',
        1,
        'PAYMENT_COMPLETED',
        'PAYMENT',
        '1',
        TRUE,
        '127.0.0.1',
        '{
            "tripId": "2",
            "amount": 115800,
            "currency": "VND"
        }',
        CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour 15 minutes'
    )

ON CONFLICT DO NOTHING;


SELECT setval(
    pg_get_serial_sequence(
        'audit_log',
        'audit_id'
    ),
    (
        SELECT MAX(audit_id)
        FROM audit_log
    ),
    true
);