const mongoose = require('mongoose');

/**
 * Short-lived link that lets the mobile app open the web "/pay" page already
 * knowing who the user is (no login on the web). Only a hash of the token is
 * stored, so a database leak can't be turned into working links.
 * Not synced to Firebase.
 */
const paymentLinkSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    email:     { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// MongoDB removes expired links on its own.
paymentLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PaymentLink', paymentLinkSchema, 'payment_links');
