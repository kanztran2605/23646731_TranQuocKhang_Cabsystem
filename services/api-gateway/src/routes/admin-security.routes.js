'use strict';
const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/authorization.middleware');
const { asyncHandler, context } = require('./transport');

module.exports = function adminSecurityRoutes({ call, enabled }) {
  const router = express.Router();
  if (!enabled) return router;
  router.get('/admin/security', authenticate, requireRole('ADMIN'), asyncHandler(async (req, res) => {
    const [password, license] = await Promise.allSettled([
      call('auth','getPasswordAtRestEvidence',{ context:context(req) },req.correlationId),
      call('driver','getLicenseAtRestEvidence',{ context:context(req) },req.correlationId),
    ]);
    const p = password.status === 'fulfilled' ? password.value : null;
    const d = license.status === 'fulfilled' ? license.value : null;
    const k = d?.keyManagement;
    const status = value => ['PASS','FAIL','UNVERIFIED'].includes(value) ? value : 'UNVERIFIED';
    const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 'UNVERIFIED';
    const flag = value => typeof value === 'boolean' ? value : 'UNVERIFIED';
    const checked = count(p?.checkedCount), hashes = count(p?.bcryptCount);
    res.set('Cache-Control','no-store');
    res.json({
      Password: {
        Status:status(p?.status), Algorithm:p?.algorithm?.startsWith('bcrypt') ? 'bcrypt' : 'UNVERIFIED',
        'Checked Records':checked,
        // Encrypted chỉ là nhãn demo cho số hash hợp lệ; bcrypt không giải mã được.
        Encrypted:typeof hashes === 'number' && typeof checked === 'number' ? `${hashes}/${checked} password hashes` : 'UNVERIFIED',
        'Plaintext Stored':p?.status === 'PASS' && typeof checked === 'number' && checked > 0 && hashes === checked && p.invalidCount === 0 ? false : 'UNVERIFIED',
      },
      'Sensitive Data': {
        Status:status(d?.status), Algorithm:d?.algorithm?.startsWith('AES-256-GCM') ? 'AES-256-GCM' : 'UNVERIFIED',
        Data:'Driver License', 'Encrypted Records':d?.status === 'UNVERIFIED' ? 'UNVERIFIED' : count(d?.authenticatedCount), 'Missing Records':count(d?.missingCount),
        'Plaintext Exposed':false,
      },
      'Key Management': {
        Status:status(k?.status), Source:k?.source === 'ENV DATA_ENCRYPTION_KEY_BASE64' ? 'Environment Variable' : 'UNVERIFIED',
        'Key Configured':flag(k?.configured), 'Key Valid':flag(k?.valid), 'Key Exposed':false,
      },
    });
  }));
  return router;
};
