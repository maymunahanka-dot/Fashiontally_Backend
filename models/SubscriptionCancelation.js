const mongoose = require('mongoose');

const subscriptionCancelationSchema = new mongoose.Schema({
  userEmail:           { type: String, default: '' },
  userId:              { type: String, default: '' },
  userName:            { type: String, default: '' },
  planType:            { type: String, default: '' },
  subscriptionType:    { type: String, default: '' },
  reason:              { type: String, default: '' },
  subscriptionEndDate: { type: String, default: '' },
  isTrialActive:       { type: Boolean, default: false },
  cancelledAt:         { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_subscription_cancelations', subscriptionCancelationSchema);
