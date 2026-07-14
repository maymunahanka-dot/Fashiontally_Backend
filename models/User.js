const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid:                { type: String, required: true, unique: true },
  id:                 { type: String },
  role:               { type: String, default: 'Designer' },
  name:               { type: String, required: true },
  phone:              { type: String },
  originalPhone:      { type: String },
  country:            { type: String },
  state:              { type: String, default: '' },
  lga:                { type: String, default: '' },
  address:            { type: String, default: '' },
  email:              { type: String, required: true, unique: true },
  originalEmail:      { type: String },
  isPhoneBasedAccount:{ type: Boolean, default: false },
  createdAt:          { type: String },
  businessName:       { type: String, default: '' },
  businessCategory:   { type: String, default: '' },
  logoUrl:            { type: String, default: '' },
  subscriptionType:   { type: String, default: 'trial' },
  isTrialActive:      { type: Boolean, default: true },
  planType:           { type: String, default: 'Growth' },
  subscriptionEndDate:{ type: String },
  isSubscribed:       { type: Boolean, default: true },
  trialStartDate:     { type: String },

  // Push notification device tokens — one entry per logged-in device
  fcmTokens: [
    {
      token:      { type: String, required: true },   // FCM registration token
      platform:   { type: String, enum: ['ios', 'android', 'web'], default: 'web' },
      deviceName: { type: String, default: '' },       // e.g. "iPhone 14", "Chrome / Windows"
      addedAt:    { type: String, default: () => new Date().toISOString() },
      enabled:    { type: Boolean, default: true },    // per-device notification switch
    }
  ],
});

module.exports = mongoose.model('fashiontally_users', userSchema);
