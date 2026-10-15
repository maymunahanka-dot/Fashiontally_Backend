const mongoose = require('mongoose');

const broadcastNotificationSchema = new mongoose.Schema({
  title:          { type: String, required: true },
  body:           { type: String, required: true },
  sentAt:         { type: String, default: () => new Date().toISOString() },
  totalTargeted:  { type: Number, default: 0 },
  delivered:      { type: Number, default: 0 },
  failed:         { type: Number, default: 0 },
  // Tracks which user emails have marked this notification as read
  seenBy:         [{ type: String }],
});

module.exports = mongoose.model('fashiontally_broadcast_notifications', broadcastNotificationSchema);
