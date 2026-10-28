'use strict';
const bcrypt = require('bcryptjs');

// Chỉ kiểm tra trường lưu mật khẩu, không đưa giá trị thật ra khỏi Auth.
function passwordEvidence(rows) {
  const valid = rows.filter(row => typeof row.pw_hash === 'string' &&
    /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/.test(row.pw_hash));
  const invalid = rows.length - valid.length;
  return {
    status: !rows.length ? 'UNVERIFIED' : invalid ? 'FAIL' : 'PASS',
    algorithm: valid.length ? 'bcrypt — hash một chiều, không giải mã' : 'UNVERIFIED',
    checkedCount: rows.length, bcryptCount: valid.length, invalidCount: invalid,
    maskedFormat: valid.length ? valid[0].pw_hash.slice(0,4) + String(bcrypt.getRounds(valid[0].pw_hash)).padStart(2,'0') + '$[đã che toàn bộ hash]' : 'Không có mẫu bcrypt hợp lệ',
    plaintextCheck: !rows.length ? 'UNVERIFIED: không có dữ liệu' : invalid ?
      'UNVERIFIED: có giá trị không đúng định dạng bcrypt; không trả giá trị nghi vấn' :
      'Không phát hiện plaintext trong trường đã kiểm tra; mọi giá trị có định dạng bcrypt hợp lệ',
    scope: 'Toàn bộ auth_db.user_account.pw_hash tại thời điểm gọi; chỉ xác minh định dạng lưu trữ, không chứng minh độ mạnh mật khẩu hoặc quét dữ liệu ngoài trường này',
  };
}
module.exports = { passwordEvidence };
