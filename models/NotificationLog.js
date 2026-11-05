const mongoose = require('mongoose');

/**
 * NotificationLog — remembers one-off emails and pushes (billing reminders,
 * payment failures, appointment reminders) so each is sent once, even if a
 * scheduled job runs on more than one server.
 *
 * key identifies the occurrence, e.g. the subscriptionEndDate a reminder is
 * about, so the next billing cycle gets its own reminders.
 */
const notificationLogSchema = new mongoose.Schema({
  email:  { type: String, required: true, lowercase: true, trim: true },
  kind:   { type: String, required: true },
  key:    { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
});

notificationLogSchema.index({ email: 1, kind: 1, key: 1 }, { unique: true });
notificationLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('NotificationLog', notificationLogSchema, 'notification_logs');
