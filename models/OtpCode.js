const mongoose = require('mongoose');

/**
 * OtpCode — one active verification code per channel + target (e.g. email address).
 *
 * The code itself is never stored, only an HMAC of it. Documents are removed
 * automatically by MongoDB once expiresAt has passed (TTL index).
 */
const otpCodeSchema = new mongoose.Schema({
  channel:     { type: String, required: true, enum: ['email', 'whatsapp'] },
  target:      { type: String, required: true, lowercase: true, trim: true },
  codeHash:    { type: String, required: true },
  expiresAt:   { type: Date,   required: true },
  attempts:    { type: Number, default: 0 },

  // Send throttling
  lastSentAt:  { type: Date,   default: Date.now },
  sendCount:   { type: Number, default: 1 },
  windowStart: { type: Date,   default: Date.now },
}, { timestamps: true });

otpCodeSchema.index({ channel: 1, target: 1 }, { unique: true });
// Keep the record a while after the code expires so send throttling still applies,
// then let MongoDB clean it up.
otpCodeSchema.index({ windowStart: 1 }, { expireAfterSeconds: 2 * 60 * 60 });

module.exports = mongoose.model('OtpCode', otpCodeSchema, 'otp_codes');
