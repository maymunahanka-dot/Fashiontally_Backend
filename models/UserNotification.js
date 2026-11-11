const mongoose = require('mongoose');

/**
 * A personal notification kept for the in-app / web inbox (pushes alone vanish,
 * and the web has no push). For now only payment and plan notices are saved;
 * see INBOX_TYPES in services/notification.service.js.
 * Not synced to Firebase. Old ones are removed after 180 days.
 */
const userNotificationSchema = new mongoose.Schema({
  email:     { type: String, required: true, index: true }, // the person it's for (billing notices: the account owner)
  type:      { type: String, required: true },
  title:     { type: String, required: true },
  body:      { type: String, default: '' },
  url:       { type: String, default: '' },
  isRead:    { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

userNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('UserNotification', userNotificationSchema, 'user_notifications');
