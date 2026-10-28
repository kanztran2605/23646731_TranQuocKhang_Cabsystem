'use strict';
const repository = require('../repositories/customer.repository');
const { toCustomerProfile } = require('../domain/customer-profile');
const { id, text, actor } = require('../../../../shared/validation');
const { AppError } = require('../../../../shared/errors/app-error');
const { phone } = require('../../../../shared/demo-input');
function createCustomerService(repo = repository) {
  function found(row) { if (!row) throw AppError.notFound('Customer does not exist'); return toCustomerProfile(row); }
  return {
    async listCustomers(request) {
      actor(request.context,['ADMIN']);
      return { items:(await repo.listAll()).map(row => {
        const profile = toCustomerProfile(row);
        delete profile.phone;
        return profile;
      }) };
    },
    async createCustomerProfile(request) {
      const input = { userId: id(request.userId), name: text(request.name, 100), address: text(request.address, 255, true), phone: phone(request.phone, true) };
      try { return toCustomerProfile(await repo.createProfile(input)); }
      catch (error) { if (error.code === '23505') throw AppError.conflict('Customer profile already exists', 'ALREADY_EXISTS'); throw error; }
    },
    async getCustomer(request) {
      const userId = actor(request.context, ['CUSTOMER', 'ADMIN']);
      const row = await repo.findById(id(request.customerId));
      if (!row) throw AppError.notFound('Customer does not exist');
      if (request.context.actorRole !== 'ADMIN' && String(row.uid) !== userId) throw AppError.forbidden();
      const profile = toCustomerProfile(row);
      if (request.context.actorRole !== 'CUSTOMER') delete profile.phone;
      return profile;
    },
    async getCustomerByUserId(request) { return found(await repo.findByUserId(id(request.userId))); },
    async validateCustomer(request) {
      const customerId = id(request.customerId);
      const row = await repo.findById(customerId);
      return row ? { valid: true, customerId: String(row.cid), userId: String(row.uid) } : { valid: false, customerId };
    },
  };
}
module.exports = { ...createCustomerService(), createCustomerService };
