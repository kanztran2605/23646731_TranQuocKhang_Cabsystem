'use strict';
const bcrypt = require('bcryptjs');
const repository = require('../repositories/user.repository');
const { ROLES, normalizeEmail, toAccount } = require('../domain/user');
const { issueAccessToken } = require('./token.service');
const { text } = require('../../../../shared/validation');
const { AppError } = require('../../../../shared/errors/app-error');
const { id, actor } = require('../../../../shared/validation');
const { passwordEvidence } = require('./password-evidence');
const { registrationId } = require('../../../../shared/demo-input');
function createAuthService(repo = repository) {
  return {
    async getPasswordAtRestEvidence(request) {
      if (process.env.DEMO_SECURITY_ENABLED !== 'true') throw AppError.notFound();
      actor(request.context,['ADMIN']);
      return passwordEvidence(await repo.passwordEvidenceRows());
    },
    async createAccount(request) {
      const email = normalizeEmail(text(request.email, 100));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Object.values(ROLES).includes(request.role)) throw AppError.badRequest();
      if (typeof request.password !== 'string' || request.password.trim().length < 3 || Buffer.byteLength(request.password) > 72) throw AppError.badRequest();
      const registration = request.registrationId ? registrationId(request.registrationId) : undefined;
      if (registration && request.role !== 'DRIVER') throw AppError.badRequest();
      const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
      if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) throw new Error('Invalid hash configuration');
      const passwordHash = await bcrypt.hash(request.password, rounds);
      try { return toAccount(await repo.createAccount({ email, passwordHash, role: request.role, registrationId: registration })); }
      catch (error) {
        if (error.code !== '23505') throw error;
        if (registration) {
          // Retry cùng hồ sơ: không tạo Account thứ hai; Account chưa đủ hồ sơ vẫn INACTIVE.
          const existing = await repo.findByEmail(email);
          if (existing?.role === 'DRIVER' && await bcrypt.compare(request.password, existing.pw_hash)) {
            if (existing.registration_id === registration) return toAccount(existing);
            if (existing.s === 'INACTIVE' && existing.registration_id && existing.registration_done === false) {
              const claimed = await repo.claimRegistration(existing.uid, existing.registration_id, registration);
              if (claimed) return toAccount(claimed);
            }
          }
        }
        throw AppError.conflict('Email already exists', 'ALREADY_EXISTS');
      }
    },
    async completeDriverRegistration(request) {
      const account = await repo.completeRegistration(id(request.userId), registrationId(request.registrationId));
      if (!account) throw AppError.conflict('Không tìm thấy hồ sơ đăng ký tương ứng');
      return toAccount(account);
    },
    async login(request) {
      const email = normalizeEmail(text(request.email, 100));
      if (typeof request.password !== 'string' || !request.password) throw AppError.badRequest();
      if (Buffer.byteLength(request.password, 'utf8') > 72) throw AppError.unauthorized('Invalid credentials');
      const account = await repo.findByEmail(email);
      if (!account || account.s !== 'ACTIVE' || !Object.values(ROLES).includes(account.role) ||
          !await bcrypt.compare(request.password, account.pw_hash)) throw AppError.unauthorized('Invalid credentials');
      return { ...issueAccessToken({ userId: account.uid, role: account.role }), userId: String(account.uid), role: account.role };
    },
  };
}
module.exports = { ...createAuthService(), createAuthService };
