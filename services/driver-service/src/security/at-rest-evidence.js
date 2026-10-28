'use strict';
const { decryptLicense } = require('./license');

function licenseEvidence(rows) {
  const encoded = process.env.DATA_ENCRYPTION_KEY_BASE64;
  const key = Buffer.from(encoded || '', 'base64');
  const validKey = key.length === 32 && key.toString('base64') === encoded;
  key.fill(0);
  let checked = 0, authenticated = 0, invalid = 0;
  for (const row of rows) {
    if (row.lic_enc == null) continue;
    checked++;
    // Không log/cất plaintext; helper kiểm tra cấu trúc + GCM authentication tag.
    if (validKey) {
      try { decryptLicense(row.lic_enc); authenticated++; }
      catch (_error) { invalid++; }
    }
  }
  return {
    status: !checked || !validKey ? 'UNVERIFIED' : invalid ? 'FAIL' : 'PASS',
    dataName: 'Giấy phép Driver (driver_db.driver_profile.lic_enc)',
    algorithm: 'AES-256-GCM — helper Driver hiện hành, xác thực tag khi đọc',
    checkedCount: checked, missingCount: rows.length - checked, authenticatedCount: authenticated, invalidCount: invalid,
    maskedFormat: authenticated ? 'v1:[IV đã che]:[ciphertext đã che]:[tag đã che]' : 'Chưa có ciphertext xác thực được',
    storage: !checked ? 'UNVERIFIED: không có giấy phép được lưu' : !validKey ?
      'UNVERIFIED: thiếu hoặc sai định dạng khóa; chưa xác minh được dữ liệu' : invalid ?
      'Có giá trị không xác thực được; không trả dữ liệu nghi vấn' : 'Các giá trị không NULL đều là ciphertext GCM xác thực thành công; không trả plaintext',
    scope: 'Toàn bộ trường lic_enc tại thời điểm gọi; NULL là chưa có dữ liệu, không phải bằng chứng mã hóa; không kiểm toán các trường/file khác',
    keyManagement: {
      status: !validKey ? 'FAIL' : 'UNVERIFIED', source: 'ENV DATA_ENCRYPTION_KEY_BASE64',
      configured: typeof encoded === 'string' && encoded.length > 0, valid: validKey,
      hardcodedKeyCheck: 'UNVERIFIED',
      scope: 'Đã kiểm tra ENV là base64 của khóa 32 byte và thử xác thực dữ liệu thật. Chưa kiểm toán toàn bộ source/Git hoặc xác minh khóa không phải khóa demo công khai; không kết luận không có hardcoded key',
    },
  };
}
module.exports = { licenseEvidence };
