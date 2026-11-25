const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid:                { type: String, required: true, unique: true },
  id:                 { type: String },
  role:               { type: String, default: 'Designer' },
  name:               { type: String, required: true },
  phone:              { type: String },
  originalPhone:      { type: String },
  country:            { type: String },
  // App language: 'en' or 'fr' (set from the country at sign-up, changeable in Settings)
  language:           { type: String, enum: ['en', 'fr'], default: 'en' },
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
  // What admins did to this account's subscription (grant trial, cancel...), newest last
  lastLoginAt:        { type: String },
  // Last time the account (owner or a team member) made a signed-in request to the backend.
  // Updated at most once an hour; used by the automated "we haven't seen you" emails.
  lastActiveAt:       { type: String },
  // Refer & Earn: code entered at sign-up (set once, never changed)
  referredByCode:     { type: String, default: '' },
  signupDeviceId:     { type: String, default: '' }, // random id from the web / app at sign-up (referral checks)
  // Unsubscribed from admin announcement emails (account emails like codes and receipts still go out)
  emailOptOut:        { type: Boolean, default: false },
  emailOptOutAt:      { type: String, default: null },
  adminLog: [
    {
      _id:     false,
      action:  { type: String },
      details: { type: String, default: '' },
      note:    { type: String, default: '' },
      admin:   { type: String, default: '' },
      at:      { type: String, default: () => new Date().toISOString() },
    },
  ],
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
