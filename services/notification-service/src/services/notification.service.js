'use strict';
const repository = require('../repositories/notification.repository');
const { toNotification } = require('../domain/notification');
const { id, actor } = require('../../../../shared/validation');
const { validateEventEnvelope } = require('../../../../shared/rabbitmq/publisher');
const { AppError } = require('../../../../shared/errors/app-error');
const POLICY = Object.freeze({
  'offer.created':['OFFER_CREATED','OFFER','offerId','Driver offer received'],
  'driver.approval.changed':['DRIVER_APPROVAL_CHANGED','DRIVER','driverId','Driver approval updated'],
  'trip.status.changed':['TRIP_STATUS_CHANGED','TRIP','tripId','Trip status updated'],
  'trip.canceled':['TRIP_CANCELED','TRIP','tripId','Trip canceled'],
  'payment.completed':['PAYMENT_COMPLETED','PAYMENT','paymentId','Payment completed'],
});
function createNotificationService(repo = repository) {
  return {
    async consume(event) {
      const policy = POLICY[event.eventType];
      if (!policy) throw AppError.badRequest('Unsupported Notification event');
      validateEventEnvelope(event,event.eventType);
      const [type,refType,refField,message] = policy, reference = id(event.payload[refField]);
      const recipients = [...new Set(event.payload.recipientUserIds.map(id))];
      for (const uid of recipients) await repo.save({ eid:event.eventId,uid,type,ref_t:refType,ref_id:reference,
        msg:message,s:'SENT',c_at:new Date(event.occurredAt) });
    },
    async listNotifications(request) {
      const uid = actor(request.context,['CUSTOMER','DRIVER','ADMIN']);
      const limit = request.limit || 5;
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw AppError.badRequest('Invalid notification limit');
      return { items:(await repo.list(uid,limit)).map(toNotification) };
    },
  };
}
module.exports = { ...createNotificationService(),createNotificationService,POLICY };
