'use strict';

const OTP_PURPOSE =
  'DRIVER_REGISTRATION';

function isExpired(expiresAt) {
  return (
    new Date(expiresAt).getTime() <=
    Date.now()
  );
}

module.exports = {
  OTP_PURPOSE,
  isExpired,
};