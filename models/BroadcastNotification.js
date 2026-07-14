const mongoose = require('mongoose');

const broadcastNotificationSchema = new mongoose.Schema({
  title:          { type: String, required: true },
  body:           { type: String, required: true },
  sentAt:         { type: String, default: () => new Date().toISOString() },
  totalTargeted:  { type: Number, default: 0 }, // users who had at least one enabled FCM token
  delivered:      { type: Number, default: 0 }, // FCM success count
  failed:         { type: Number, default: 0 }, // FCM failure count
});

module.exports = mongoose.model('fashiontally_broadcast_notifications', broadcastNotificationSchema);
