const mongoose = require('mongoose');

/**
 * Refer & Earn. Not a wallet: a ledger of who referred whom, what each referral earned
 * and how it was paid out (manually, by bank transfer, by the admin team).
 * See services/referral.service.js. None of this is synced to Firebase.
 */

const auditEntry = {
  _id: false,
  at: { type: Date, default: Date.now },
  by: { type: String, default: '' },     // 'system' or the admin's label
  action: { type: String, default: '' },
  note: { type: String, default: '' },
};

/** One per participating user: their code, bank details for payouts, suspension. */
const accountSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    bank: {
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      accountName: { type: String, default: '' },
      updatedAt: { type: Date, default: null },
    },
    suspended: { type: Boolean, default: false },
    suspendedReason: { type: String, default: '' },
    flags: { type: [String], default: [] },
    audit: { type: [auditEntry], default: [] },
  },
  { timestamps: true }
);
accountSchema.index({ 'bank.accountNumber': 1 });

/**
 * One per referred customer (a customer can only ever be referred once).
 * status:       registered (signed up) → first_payment (1 of 2 monthly payments)
 *               → paid (qualified: 2nd payment in a row, or a yearly payment) | not_eligible
 * rewardStatus: none → pending (hold period) → eligible → paid | reversed
 * review:       none | needs_review (flagged) → approved | on_hold | rejected (admin)
 *               Rewards only move to "eligible" while review is none or approved.
 */
const referralSchema = new mongoose.Schema(
  {
    referrerEmail: { type: String, required: true, index: true },
    code: { type: String, required: true },
    referredEmail: { type: String, required: true, unique: true },
    referredName: { type: String, default: '' },
    source: { type: String, default: '' },             // web | google | app
    status: { type: String, enum: ['registered', 'first_payment', 'paid', 'not_eligible'], default: 'registered', index: true },
    notEligibleReason: { type: String, default: '' },
    plan: { type: String, default: '' },
    billingCycle: { type: String, default: '' },
    amountPaid: { type: Number, default: 0 },
    firstPaymentId: { type: String, default: null },   // payment 1 of 2
    firstPaidAt: { type: Date, default: null },
    firstPlan: { type: String, default: '' },
    firstBillingCycle: { type: String, default: '' },
    paymentId: { type: String, default: null },        // the payment that qualified the referral (2nd, or yearly)
    paidAt: { type: Date, default: null },
    reward: { type: Number, default: 0 },
    rewardStatus: { type: String, enum: ['none', 'pending', 'eligible', 'paid', 'reversed'], default: 'none', index: true },
    eligibleAt: { type: Date, default: null },
    payoutId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    signupIp: { type: String, default: '' },
    signupDevice: { type: String, default: '' },       // browser / app user agent
    deviceId: { type: String, default: '', index: true }, // random id the web / app keeps on the device
    flags: { type: [String], default: [] },
    review: { type: String, enum: ['none', 'needs_review', 'approved', 'on_hold', 'rejected'], default: 'none', index: true },
    reviewNote: { type: String, default: '' },
    reviewedBy: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    audit: { type: [auditEntry], default: [] },
  },
  { timestamps: true }
);
// A payment can only ever produce one reward
referralSchema.index({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } });

/** A payout request: requested → approved → paid, or rejected. */
const payoutSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    referralIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    bank: {
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      accountName: { type: String, default: '' },
    },
    status: { type: String, enum: ['requested', 'approved', 'rejected', 'paid'], default: 'requested', index: true },
    reference: { type: String, default: '' },          // bank transfer reference, set when paid
    rejectReason: { type: String, default: '' },
    flags: { type: [String], default: [] },
    paidAt: { type: Date, default: null },
    audit: { type: [auditEntry], default: [] },
  },
  { timestamps: true }
);

/** A click on someone's referral link (counted at most once a day per device). */
const clickSchema = new mongoose.Schema({
  code: { type: String, required: true, index: true },
  key: { type: String, required: true, unique: true }, // code + day + device hash
  at: { type: Date, default: Date.now },
});

/** Programme settings (one row). */
const settingSchema = new mongoose.Schema({
  id: { type: String, default: 'main', unique: true },
  enabled: { type: Boolean, default: true },
  rewards: {
    STARTER: { type: Number, default: 1000 },
    GROWTH: { type: Number, default: 2000 },
    PROFESSIONAL: { type: Number, default: 3000 },
  },
  minPayout: { type: Number, default: 5000 },
  holdDays: { type: Number, default: 14 },
  // Qualifying: two monthly payments in a row, the 2nd within this many days of the 1st
  secondPaymentWindowDays: { type: Number, default: 45 },
  yearlyQualifies: { type: Boolean, default: true },   // a yearly payment (12 months paid) qualifies on its own
  // Flag for admin review when one referrer brings in this many sign-ups
  flagSignupsPerDay: { type: Number, default: 5 },
  flagSignupsPerMonth: { type: Number, default: 20 },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: '' },
});

module.exports = {
  ReferralAccount: mongoose.model('ReferralAccount', accountSchema, 'referral_accounts'),
  Referral: mongoose.model('Referral', referralSchema, 'referrals'),
  ReferralPayout: mongoose.model('ReferralPayout', payoutSchema, 'referral_payouts'),
  ReferralClick: mongoose.model('ReferralClick', clickSchema, 'referral_clicks'),
  ReferralSetting: mongoose.model('ReferralSetting', settingSchema, 'referral_settings'),
};
