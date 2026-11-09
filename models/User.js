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
  // Set from the mobile app's Edit Profile screen
  displayName:        { type: String },
  phoneNumber:        { type: String },
  bio:                { type: String, default: '' },
  photoURL:           { type: String, default: '' },
  updatedAt:          { type: String },
  subscriptionType:   { type: String, default: 'trial' },
  isTrialActive:      { type: Boolean, default: true },
  planType:           { type: String, default: 'Growth' },
  subscriptionEndDate:{ type: String },
  // Start of the current paid period and whether it was paid monthly or yearly
  // (set on payment; older accounts don't have them and are worked out instead)
  subscriptionStartDate: { type: String },
  billingCycle:       { type: String, enum: ['monthly', 'yearly'] },
  isSubscribed:       { type: Boolean, default: true },
  trialStartDate:     { type: String },
  payment_amount:     { type: Number, default: null },
  payment_date:       { type: String, default: null },
  txRef:              { type: String, default: '' },
  transactionId:      { type: String, default: '' },

  // Push notification device tokens — one entry per logged-in device
  fcmTokens: [
    {
      token:      { type: String, required: true },   // FCM registration token
      platform:   { type: String, enum: ['ios', 'android', 'web'], default: 'web' },
      deviceName: { type: String, default: '' },       // e.g. "iPhone 14", "Chrome / Windows"
      addedAt:    { type: String, default: () => new Date().toISOString() },
      enabled:    { type: Boolean, default: true },    // per-device notification switch
      // Who is signed in on this device: the owner, or a team member whose
      // devices are stored on the owner's account. '' = registered before this was tracked.
      signedInAs: { type: String, default: '' },
    }
  ],
});

module.exports = mongoose.model('fashiontally_users', userSchema);
