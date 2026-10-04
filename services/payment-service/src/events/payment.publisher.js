'use strict';
const { publishEvent } = require('../../../../shared/rabbitmq/publisher');
const { eventId } = require('../../../../shared/rabbitmq/event-id');
function createPaymentPublisher(publish = publishEvent) {
  return row => publish({ producer:'payment-service', eventType:'payment.completed',
    eventId:eventId('payment.completed:' + row.pid), occurredAt:new Date(row.paid_at).toISOString(),
    correlationId:row.correlationId, payload:{ paymentId:String(row.pid),bookingId:String(row.bid),tripId:String(row.tid),
      customerId:String(row.cid),amount:Number(row.amt),paidAt:new Date(row.paid_at).toISOString(),recipientUserIds:[String(row.customer_uid)] } });
}
module.exports = { publishPaymentCompleted:createPaymentPublisher(), createPaymentPublisher };
