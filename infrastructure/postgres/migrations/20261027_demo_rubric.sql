\set ON_ERROR_STOP on

-- Chỉ bổ sung cột/bảng/index; không xóa hoặc ghi đè dữ liệu đã đăng ký.
\connect auth_db
BEGIN;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS registration_id UUID;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS registration_done BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_registration ON user_account(registration_id);
COMMIT;

\connect customer_db
BEGIN;
ALTER TABLE customer_profile ADD COLUMN IF NOT EXISTS phone VARCHAR(11);
COMMIT;

\connect driver_db
BEGIN;
ALTER TABLE driver_profile ADD COLUMN IF NOT EXISTS phone VARCHAR(11);
-- Hồ sơ cũ được giữ NULL; đăng ký mới bắt buộc phone tại service.
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_phone ON driver_profile(phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_plate_normalized ON vehicle(upper(btrim(plate)));
ALTER TABLE vehicle ALTER COLUMN vt SET DEFAULT 'BIKE';
CREATE TABLE IF NOT EXISTS driver_otp (
  phone VARCHAR(11) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  registration_id UUID UNIQUE,
  fingerprint VARCHAR(64),
  plate VARCHAR(20) UNIQUE,
  uid BIGINT
);
GRANT SELECT,INSERT,UPDATE,DELETE ON driver_otp TO :"runtime_user";
COMMIT;

\connect booking_db
ALTER TABLE booking ALTER COLUMN vt SET DEFAULT 'BIKE';

\connect payment_db
BEGIN;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS pay_request JSONB;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS pay_response JSONB;
-- Với Payment canonical đã có key, response Pay đầu tiên luôn là PENDING.
-- Chỉ dựng snapshot từ các cột bất biến; không đổi amount/status/paid_at hay key.
UPDATE payment SET
  pay_request=jsonb_build_object('paymentId',pid::text,'amount',amt::double precision),
  pay_response=jsonb_build_object(
    'paymentId',pid::text,'bookingId',bid::text,'tripId',tid::text,'customerId',cid::text,
    'amount',amt::double precision,'eligible',true,'status','PENDING',
    'idempotencyKey',ikey,'createdAt',to_char(c_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
WHERE ikey IS NOT NULL AND eligible=true AND tid IS NOT NULL AND amt=50000
  AND pay_request IS NULL AND pay_response IS NULL;
COMMIT;
