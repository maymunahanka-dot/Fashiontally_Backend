const mongoose = require('mongoose');

/**
 * An admin email sent to many users. Brevo's free plan has a daily cap, so recipients are
 * queued and sent in daily batches by services/adminEmailQueue.service.js.
 *
 * Recipient status: queued → sending → sent | failed; queued → cancelled when the admin stops it.
 * Campaign status: sending (has queued recipients) → completed, or cancelled.
 */
const recipientSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    name: { type: String, default: '' },
    status: { type: String, enum: ['queued', 'sending', 'sent', 'failed', 'cancelled'], default: 'queued' },
    claimedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    error: { type: String, default: '' },
  },
  { _id: false }
);

const emailCampaignSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  message: { type: String, required: true },
  // How the recipients were chosen, for the history list: 'all' | 'status' | 'selected'
  audienceType: { type: String, default: 'all' },
  audienceLabel: { type: String, default: '' },
  recipients: [recipientSchema],
  status: { type: String, enum: ['sending', 'completed', 'cancelled'], default: 'sending', index: true },
  createdBy: { type: String, default: 'Admin' },
  createdAt: { type: Date, default: Date.now, index: true },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
});

module.exports = mongoose.model('fashiontally_email_campaigns', emailCampaignSchema);
