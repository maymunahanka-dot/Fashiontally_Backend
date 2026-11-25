/**
 * Refer & Earn: the rules.
 *
 *   1. Every user gets a code (FT-XXXXXX), created the first time it's needed.
 *   2. A new customer enters the code at sign-up (the web link ?ref=CODE fills it in).
 *      attachAtSignup() links them to the referrer, once and for good.
 *   3. The referral qualifies when the customer makes TWO monthly subscription payments in a row
 *      (the 2nd within `secondPaymentWindowDays` of the 1st), or one yearly payment
 *      (`yearlyQualifies`). The reward is by plan (Starter ₦1,000 · Growth ₦2,000 ·
 *      Professional ₦3,000), held `holdDays` (14) before it can be paid out.
 *      A payment can only ever earn one reward.
 *   3b. Unusual activity (same network or device, too many sign-ups for one referrer) is flagged
 *      for admin review, never rejected automatically. A flagged reward waits until an admin
 *      approves it; admins can also put a referral on hold or reject it.
 *   4. Once eligible rewards reach `minPayout` (₦5,000), the user adds bank details and
 *      requests a payout; admins pay it by hand and record the transfer reference.
 *
 * Not a wallet: no deposits, transfers or automatic withdrawals.
 */
const crypto = require('crypto');
const cron = require('node-cron');
const User = require('../models/User');
const Payment = require('../models/Payment');
const BrandSetting = require('../models/BrandSetting');
const { ReferralAccount, Referral, ReferralPayout, ReferralClick, ReferralSetting } = require('../models/Referral');

const DAY = 24 * 60 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

const normEmail = (e) => String(e || '').trim().toLowerCase();
const normCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// ── Settings ──────────────────────────────────────────────────────────────

const getSettings = async () => {
  let s = await ReferralSetting.findOne({ id: 'main' }).lean();
  if (!s) {
    try {
      await ReferralSetting.create({ id: 'main' });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    s = await ReferralSetting.findOne({ id: 'main' }).lean();
  }
  return s;
};

const rewardFor = (settings, plan) => Number(settings.rewards?.[String(plan || '').toUpperCase()]) || 0;

// ── Codes ─────────────────────────────────────────────────────────────────

const randomPart = (n) => Array.from(crypto.randomBytes(n), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

/** The user's referral account, created with a new unique code if they don't have one yet */
const getOrCreateAccount = async (email) => {
  const key = normEmail(email);
  const existing = await ReferralAccount.findOne({ email: key }).lean();
  if (existing) return existing;
  const user = await User.findOne({ email: key }, 'name businessName').lean();
  const letters = String(user?.businessName || user?.name || key).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  for (let i = 0; i < 8; i++) {
    const code = `FT-${letters}${randomPart(3)}`;
    try {
      return (await ReferralAccount.create({ email: key, code })).toObject();
    } catch (error) {
      if (error.code !== 11000) throw error;
      const raced = await ReferralAccount.findOne({ email: key }).lean(); // created by another request
      if (raced) return raced;
    }
  }
  throw new Error('Could not create a referral code');
};

/** Name to show for a code ("Referred by Adunni Styles"), or null if the code isn't usable */
const lookupCode = async (code) => {
  const account = await ReferralAccount.findOne({ code: normCode(code) }).lean();
  if (!account || account.suspended) return null;
  const [brand, user] = await Promise.all([
    BrandSetting.findOne({ userEmail: account.email }, 'businessName').lean(),
    User.findOne({ email: account.email }, 'name businessName').lean(),
  ]);
  return { code: account.code, email: account.email, name: brand?.businessName || user?.businessName || String(user?.name || '').split(' ')[0] || 'A FashionTally user' };
};

// ── Clicks ────────────────────────────────────────────────────────────────

/** Counts a click on a referral link, at most once a day per device */
const recordClick = async (code, ip, device) => {
  const c = normCode(code);
  if (!c || !(await ReferralAccount.exists({ code: c }))) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = crypto.createHash('sha256').update(`${c}|${day}|${ip}|${device}`).digest('hex');
  await ReferralClick.create({ code: c, key }).catch((e) => {
    if (e.code !== 11000) throw e;
  });
};

// ── Sign-up ───────────────────────────────────────────────────────────────

/**
 * Links a brand-new account to the referrer behind `code`. Never throws (sign-up must not fail
 * because of a referral). Returns { ok, reason }.
 */
const attachAtSignup = async ({ email, name, phone, code, ip = '', device = '', deviceId = '', source = 'web' }) => {
  try {
    const c = normCode(code);
    if (!c) return { ok: false, reason: 'no code' };
    const settings = await getSettings();
    if (!settings.enabled) return { ok: false, reason: 'programme off' };
    const referred = normEmail(email);
    const account = await ReferralAccount.findOne({ code: c }).lean();
    if (!account) return { ok: false, reason: 'unknown code' };
    if (account.suspended) return { ok: false, reason: 'referrer suspended' };
    if (account.email === referred) return { ok: false, reason: 'self-referral' };

    // Same phone number as the referrer = the same person
    const referrer = await User.findOne({ email: account.email }, 'phone name').lean();
    if (digits(phone) && digits(phone) === digits(referrer?.phone)) return { ok: false, reason: 'self-referral (same phone)' };

    // Existing customers don't qualify: anyone who has ever paid, or was referred before
    if (await Payment.exists({ email: new RegExp(`^${referred.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), status: 'successful' })) {
      return { ok: false, reason: 'existing customer' };
    }

    // Flags for admin review (never an automatic rejection: shared networks and devices happen)
    const flags = [];
    if (ip) {
      const sameNetwork = await Referral.countDocuments({ referrerEmail: account.email, signupIp: ip, createdAt: { $gte: new Date(Date.now() - 7 * DAY) } });
      if (sameNetwork >= 2) flags.push(`${sameNetwork + 1} sign-ups from the same network this week`);
    }
    const devId = String(deviceId || '').trim().slice(0, 100);
    if (devId) {
      const referrerUser = await User.findOne({ email: account.email }, 'signupDeviceId').lean();
      if (referrerUser?.signupDeviceId && referrerUser.signupDeviceId === devId) flags.push('Signed up on the same device as the referrer');
      const sameDevice = await Referral.countDocuments({ deviceId: devId, referredEmail: { $ne: referred } });
      if (sameDevice > 0) flags.push(`Same device as ${sameDevice} other referred sign-up${sameDevice === 1 ? '' : 's'}`);
    }
    const [lastDay, lastMonth] = await Promise.all([
      Referral.countDocuments({ referrerEmail: account.email, createdAt: { $gte: new Date(Date.now() - DAY) } }),
      Referral.countDocuments({ referrerEmail: account.email, createdAt: { $gte: new Date(Date.now() - 30 * DAY) } }),
    ]);
    const volumeFlags = [];
    if (lastDay + 1 >= (settings.flagSignupsPerDay ?? 5)) volumeFlags.push(`${lastDay + 1} referred sign-ups in 24 hours`);
    else if (lastMonth + 1 >= (settings.flagSignupsPerMonth ?? 20)) volumeFlags.push(`${lastMonth + 1} referred sign-ups in 30 days`);
    flags.push(...volumeFlags);

    await Referral.create({
      referrerEmail: account.email,
      code: c,
      referredEmail: referred,
      referredName: String(name || '').trim(),
      source,
      signupIp: ip,
      signupDevice: String(device).slice(0, 200),
      deviceId: devId,
      flags,
      review: flags.length ? 'needs_review' : 'none',
      audit: [
        { by: 'system', action: 'registered', note: `Signed up with code ${c} (${source})` },
        ...(flags.length ? [{ by: 'system', action: 'flagged', note: flags.join('; ') }] : []),
      ],
    });
    if (volumeFlags.length) {
      await ReferralAccount.updateOne({ _id: account._id }, { $addToSet: { flags: { $each: volumeFlags } } }).catch(() => {});
    }
    await User.updateOne({ email: referred }, { $set: { referredByCode: c } }).catch(() => {});
    notify(account.email, 'signup', { name: String(name || '').trim().split(' ')[0] || 'Someone' });
    return { ok: true };
  } catch (error) {
    if (error.code === 11000) return { ok: false, reason: 'already referred' };
    console.error('[referral] attach failed:', error.message);
    return { ok: false, reason: error.message };
  }
};

// ── Payments ──────────────────────────────────────────────────────────────

const paymentDate = (payment) => new Date(payment.paidAt || payment.createdAt || Date.now());
const isYearly = (payment) => String(payment.billingCycle || '').toLowerCase() === 'yearly';
const isUnderReview = (r) => ['needs_review', 'on_hold'].includes(r.review);

/** Marks the referral qualified by `payment` and starts the hold period for the reward */
const qualify = async (referral, payment, settings, why) => {
  const plan = String(payment.plantype || '').toUpperCase() || referral.firstPlan;
  const reward = rewardFor(settings, plan);
  if (!reward) return null;
  const hold = settings.holdDays ?? 14;
  const updated = await Referral.findOneAndUpdate(
    { _id: referral._id, status: referral.status },
    {
      $set: {
        status: 'paid',
        plan,
        billingCycle: payment.billingCycle || '',
        amountPaid: Number(payment.planPrice) || 0,
        paymentId: String(payment.id),
        paidAt: paymentDate(payment),
        reward,
        rewardStatus: 'pending',
        eligibleAt: new Date(Date.now() + hold * DAY),
      },
      $push: { audit: { by: 'system', action: 'qualified', note: `${why}. ${plan} payment ${payment.id}: ₦${reward} pending ${hold} days${isUnderReview(referral) ? ' (waiting for admin review)' : ''}` } },
    },
    { new: true }
  ).lean();
  if (updated) {
    notify(updated.referrerEmail, isUnderReview(updated) ? 'reward_review' : 'reward', {
      name: updated.referredName.split(' ')[0] || 'Your referral', reward, plan, holdDays: hold,
    });
  }
  return updated;
};

/** Records `payment` as payment 1 of 2 (also used to start the count again after a gap or refund) */
const recordFirstPayment = async (referral, payment, note) => {
  const updated = await Referral.findOneAndUpdate(
    { _id: referral._id, status: referral.status, firstPaymentId: referral.firstPaymentId ?? null },
    {
      $set: {
        status: 'first_payment',
        firstPaymentId: String(payment.id),
        firstPaidAt: paymentDate(payment),
        firstPlan: String(payment.plantype || '').toUpperCase(),
        firstBillingCycle: payment.billingCycle || 'monthly',
        plan: String(payment.plantype || '').toUpperCase(),
      },
      $push: { audit: { by: 'system', action: 'first_payment', note } },
    },
    { new: true }
  ).lean();
  if (updated && referral.status === 'registered') {
    notify(updated.referrerEmail, 'first_payment', { name: updated.referredName.split(' ')[0] || 'Your referral' });
  }
  return updated;
};

/**
 * Called after a subscription payment is verified (both gateways). Safe to call twice for the
 * same payment. The referral qualifies on the customer's 2nd monthly payment in a row (or a
 * yearly payment); the 1st payment only moves it to "first_payment".
 */
const onPaymentSuccess = async (user, payment) => {
  try {
    if (!payment || payment.status !== 'successful') return;
    const referredEmail = normEmail(user?.email || payment.email);
    const referral = await Referral.findOne({ referredEmail, status: { $in: ['registered', 'first_payment'] } }).lean();
    if (!referral || referral.review === 'rejected') return;
    const settings = await getSettings();
    const pid = String(payment.id);
    const plan = String(payment.plantype || user?.planType || '').toUpperCase();
    payment = { ...payment, plantype: plan };

    if (referral.status === 'registered') {
      // Existing customers don't qualify: the customer must not have paid before
      const paidBefore = await Payment.countDocuments({ email: payment.email, status: 'successful', id: { $ne: payment.id } });
      if (paidBefore > 0) {
        await Referral.updateOne(
          { _id: referral._id, status: 'registered' },
          { $set: { status: 'not_eligible', notEligibleReason: 'Not their first payment' }, $push: { audit: { by: 'system', action: 'not_eligible', note: 'Customer had paid before' } } }
        );
        return;
      }
      if (isYearly(payment) && settings.yearlyQualifies !== false) {
        await qualify(referral, payment, settings, 'Yearly payment');
        return;
      }
      await recordFirstPayment(referral, payment, `Payment 1 of 2: ${plan} ${payment.billingCycle || 'monthly'} (${pid})`);
      return;
    }

    // status === 'first_payment'
    if (pid === referral.firstPaymentId) return; // same payment reported twice
    const first = await Payment.findOne({ id: referral.firstPaymentId }).lean();
    const windowDays = settings.secondPaymentWindowDays ?? 45;
    const gapDays = (paymentDate(payment) - new Date(referral.firstPaidAt)) / DAY;
    if (!first || first.status !== 'successful') {
      await recordFirstPayment(referral, payment, `Payment 1 was refunded or reversed, so this payment (${pid}) counts as the new payment 1 of 2`);
      return;
    }
    if (gapDays > windowDays) {
      await recordFirstPayment(referral, payment, `${Math.round(gapDays)} days since payment 1 (more than ${windowDays}), so this payment (${pid}) counts as the new payment 1 of 2`);
      return;
    }
    await qualify(referral, payment, settings, `Payment 2 of 2 (${Math.round(gapDays)} days after payment 1)`);
  } catch (error) {
    if (error.code === 11000) return; // this payment already earned its reward
    console.error('[referral] payment hook failed:', error.message);
  }
};

/** Moves rewards past their hold period to "eligible" (checks the payment is still successful) */
const releaseHeldRewards = async (filter = {}) => {
  const due = await Referral.find({ ...filter, rewardStatus: 'pending', eligibleAt: { $lte: new Date() }, review: { $in: ['none', 'approved'] } }).lean();
  const settings = await getSettings();
  const touched = new Set();
  for (const r of due) {
    const ids = [r.paymentId, r.firstPaymentId].filter(Boolean);
    const payments = await Payment.find({ id: { $in: ids } }, 'id status').lean();
    if (payments.length < ids.length || payments.some((p) => p.status !== 'successful')) {
      await Referral.updateOne(
        { _id: r._id, rewardStatus: 'pending' },
        { $set: { rewardStatus: 'reversed' }, $push: { audit: { by: 'system', action: 'reversed', note: 'A qualifying payment is no longer successful (refund or reversal)' } } }
      );
      continue;
    }
    const res = await Referral.updateOne(
      { _id: r._id, rewardStatus: 'pending' },
      { $set: { rewardStatus: 'eligible' }, $push: { audit: { by: 'system', action: 'eligible', note: 'Hold period over' } } }
    );
    if (res.modifiedCount) touched.add(r.referrerEmail);
  }
  for (const email of touched) {
    const { available } = await balances(email);
    notify(email, 'eligible', { available, minPayout: settings.minPayout });
  }
  return { released: due.length };
};

// ── Balances and payouts ──────────────────────────────────────────────────

/** Money for one referrer: earned, pending (hold period), available (ready, not in a payout), in a payout, paid out */
const balances = async (email) => {
  const rows = await Referral.find({ referrerEmail: normEmail(email), status: 'paid' }, 'reward rewardStatus payoutId review').lean();
  const sum = (test) => rows.filter(test).reduce((s, r) => s + (Number(r.reward) || 0), 0);
  return {
    earned: sum((r) => r.rewardStatus !== 'reversed'),
    pending: sum((r) => r.rewardStatus === 'pending'),
    available: sum((r) => r.rewardStatus === 'eligible' && !r.payoutId && !isUnderReview(r)),
    inReview: sum((r) => ['pending', 'eligible'].includes(r.rewardStatus) && !r.payoutId && isUnderReview(r)),
    inPayout: sum((r) => r.rewardStatus === 'eligible' && r.payoutId),
    paidOut: sum((r) => r.rewardStatus === 'paid'),
  };
};

const BANK_RE = /^\d{10}$/;

const saveBankDetails = async (email, { bankName, accountNumber, accountName }) => {
  const bank = {
    bankName: String(bankName || '').trim().slice(0, 80),
    accountNumber: String(accountNumber || '').replace(/\s/g, ''),
    accountName: String(accountName || '').trim().slice(0, 100),
  };
  if (!bank.bankName || !bank.accountName) throw Object.assign(new Error('Enter your bank name and account name'), { status: 400 });
  if (!BANK_RE.test(bank.accountNumber)) throw Object.assign(new Error('Account number must be 10 digits'), { status: 400 });
  const account = await getOrCreateAccount(email);
  const others = await ReferralAccount.find({ 'bank.accountNumber': bank.accountNumber, email: { $ne: account.email } }, 'email').lean();
  const update = { $set: { bank: { ...bank, updatedAt: new Date() } }, $push: { audit: { by: email, action: 'bank_updated', note: `${bank.bankName} ****${bank.accountNumber.slice(-4)}` } } };
  if (others.length) update.$addToSet = { flags: `Bank account also used by ${others.map((o) => o.email).join(', ')}` };
  await ReferralAccount.updateOne({ _id: account._id }, update);
  return bank;
};

const requestPayout = async (email) => {
  const key = normEmail(email);
  const [settings, account] = await Promise.all([getSettings(), getOrCreateAccount(key)]);
  if (account.suspended) throw Object.assign(new Error('Your referral account is on hold. Please contact support.'), { status: 403 });
  if (!BANK_RE.test(account.bank?.accountNumber || '')) throw Object.assign(new Error('Add your bank details first'), { status: 400 });
  if (await ReferralPayout.exists({ email: key, status: { $in: ['requested', 'approved'] } })) {
    throw Object.assign(new Error('You already have a payout request in progress'), { status: 400 });
  }
  const { available } = await balances(key);
  if (available < settings.minPayout) {
    throw Object.assign(new Error(`You need at least ₦${settings.minPayout.toLocaleString('en-NG')} ready to withdraw`), { status: 400 });
  }

  const payout = await ReferralPayout.create({
    email: key,
    amount: 0,
    bank: { bankName: account.bank.bankName, accountNumber: account.bank.accountNumber, accountName: account.bank.accountName },
    flags: account.flags || [],
    audit: [{ by: key, action: 'requested' }],
  });
  // Claim the eligible rewards for this payout (a reward can only be in one payout)
  await Referral.updateMany(
    { referrerEmail: key, status: 'paid', rewardStatus: 'eligible', payoutId: null, review: { $in: ['none', 'approved'] } },
    { $set: { payoutId: payout._id } }
  );
  const claimed = await Referral.find({ payoutId: payout._id }, 'reward').lean();
  const amount = claimed.reduce((s, r) => s + r.reward, 0);
  if (amount < settings.minPayout) {
    await Referral.updateMany({ payoutId: payout._id }, { $set: { payoutId: null } });
    await ReferralPayout.deleteOne({ _id: payout._id });
    throw Object.assign(new Error('Not enough ready to withdraw. Please try again.'), { status: 400 });
  }
  await ReferralPayout.updateOne({ _id: payout._id }, { $set: { amount, referralIds: claimed.map((r) => r._id) } });
  return ReferralPayout.findById(payout._id).lean();
};

/** Admin actions on a payout: approve, reject (rewards go back to available), mark paid */
const updatePayout = async (id, action, { by, reference = '', reason = '' }) => {
  const payout = await ReferralPayout.findById(id).lean();
  if (!payout) throw Object.assign(new Error('Payout not found'), { status: 404 });
  const audit = { by, action, note: reason || reference };

  if (action === 'approve') {
    const r = await ReferralPayout.updateOne({ _id: id, status: 'requested' }, { $set: { status: 'approved' }, $push: { audit } });
    if (!r.modifiedCount) throw Object.assign(new Error('Only new requests can be approved'), { status: 400 });
    notify(payout.email, 'payout_approved', { amount: payout.amount });
  } else if (action === 'reject') {
    const r = await ReferralPayout.updateOne({ _id: id, status: { $in: ['requested', 'approved'] } }, { $set: { status: 'rejected', rejectReason: reason }, $push: { audit } });
    if (!r.modifiedCount) throw Object.assign(new Error('This payout can no longer be rejected'), { status: 400 });
    await Referral.updateMany({ payoutId: payout._id, rewardStatus: 'eligible' }, { $set: { payoutId: null } });
    notify(payout.email, 'payout_rejected', { amount: payout.amount, reason });
  } else if (action === 'paid') {
    if (!String(reference).trim()) throw Object.assign(new Error('Enter the bank transfer reference'), { status: 400 });
    // Only once: a paid payout can't be paid again
    const r = await ReferralPayout.updateOne(
      { _id: id, status: { $in: ['requested', 'approved'] } },
      { $set: { status: 'paid', reference: String(reference).trim().slice(0, 100), paidAt: new Date() }, $push: { audit } }
    );
    if (!r.modifiedCount) throw Object.assign(new Error('This payout is already paid or was rejected'), { status: 400 });
    await Referral.updateMany(
      { payoutId: payout._id, rewardStatus: 'eligible' },
      { $set: { rewardStatus: 'paid' }, $push: { audit: { by, action: 'paid_out', note: `Payout ${payout._id} ref ${reference}` } } }
    );
    notify(payout.email, 'payout_paid', { amount: payout.amount, reference });
  } else {
    throw Object.assign(new Error('Unknown action'), { status: 400 });
  }
  return ReferralPayout.findById(id).lean();
};

/** Admin: reverse an invalid reward (not one already paid out or inside an open payout) */
const reverseReward = async (referralId, { by, reason }) => {
  if (!String(reason || '').trim()) throw Object.assign(new Error('Give a reason'), { status: 400 });
  const r = await Referral.updateOne(
    { _id: referralId, rewardStatus: { $in: ['pending', 'eligible'] }, payoutId: null },
    { $set: { rewardStatus: 'reversed' }, $push: { audit: { by, action: 'reversed', note: reason } } }
  );
  if (!r.modifiedCount) throw Object.assign(new Error('Only pending or ready rewards that are not in a payout can be reversed'), { status: 400 });
};

/**
 * Admin decision on one referral:
 *   approve  needs_review / on_hold → approved (the reward continues; released now if the hold is over)
 *   hold     → on_hold (the reward is frozen, not paid out, until approved)
 *   reject   → rejected + not eligible, reward reversed (not possible once it is in a payout or paid)
 */
const reviewReferral = async (referralId, action, { by, reason = '' }) => {
  const note = String(reason || '').trim().slice(0, 300);
  const r = await Referral.findById(referralId).lean();
  if (!r) throw Object.assign(new Error('Referral not found'), { status: 404 });
  const stamp = { reviewNote: note, reviewedBy: by, reviewedAt: new Date() };

  if (action === 'approve') {
    if (r.review === 'rejected') throw Object.assign(new Error('This referral was rejected'), { status: 400 });
    await Referral.updateOne({ _id: r._id }, { $set: { review: 'approved', ...stamp }, $push: { audit: { by, action: 'approved', note } } });
    await releaseHeldRewards({ _id: r._id });
  } else if (action === 'hold') {
    if (!note) throw Object.assign(new Error('Give a reason'), { status: 400 });
    if (r.review === 'rejected') throw Object.assign(new Error('This referral was rejected'), { status: 400 });
    if (r.payoutId || r.rewardStatus === 'paid') throw Object.assign(new Error('This reward is already in a payout. Reject the payout first.'), { status: 400 });
    await Referral.updateOne({ _id: r._id }, { $set: { review: 'on_hold', ...stamp }, $push: { audit: { by, action: 'on_hold', note } } });
  } else if (action === 'reject') {
    if (!note) throw Object.assign(new Error('Give a reason'), { status: 400 });
    if (r.payoutId || r.rewardStatus === 'paid') throw Object.assign(new Error('This reward is already in a payout. Reject the payout first.'), { status: 400 });
    const $set = { review: 'rejected', ...stamp, notEligibleReason: note };
    if (r.status !== 'paid') $set.status = 'not_eligible';
    if (['pending', 'eligible'].includes(r.rewardStatus)) $set.rewardStatus = 'reversed';
    await Referral.updateOne({ _id: r._id, payoutId: null }, { $set, $push: { audit: { by, action: 'rejected', note } } });
    if (r.reward && ['pending', 'eligible'].includes(r.rewardStatus)) {
      notify(r.referrerEmail, 'reward_rejected', { name: r.referredName.split(' ')[0] || 'Your referral', reward: r.reward });
    }
  } else {
    throw Object.assign(new Error('Unknown action'), { status: 400 });
  }
  return Referral.findById(r._id).lean();
};

// ── Notifications (email + in-app) ────────────────────────────────────────

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

const MESSAGES = {
  signup: (d) => ({
    title: 'Someone joined with your code 🎉',
    body: `${d.name} signed up with your referral code. You'll earn a reward after they pay for two months in a row (or one year).`,
  }),
  first_payment: (d) => ({
    title: `${d.name} made their first payment`,
    body: `${d.name} paid for their first month. Your reward is recorded when they pay for the second month.`,
  }),
  reward: (d) => ({
    title: `You earned ${naira(d.reward)}!`,
    body: `${d.name} subscribed to the ${d.plan.charAt(0) + d.plan.slice(1).toLowerCase()} plan. Your ${naira(d.reward)} reward is pending for ${d.holdDays} days, then you can withdraw it.`,
  }),
  reward_review: (d) => ({
    title: `You earned ${naira(d.reward)}!`,
    body: `${d.name} qualified on the ${d.plan.charAt(0) + d.plan.slice(1).toLowerCase()} plan. Our team is checking this referral before the ${naira(d.reward)} reward can be withdrawn.`,
  }),
  reward_rejected: (d) => ({
    title: 'Referral reward not approved',
    body: `After review, the ${naira(d.reward)} reward for ${d.name} was not approved. Contact support if you have questions.`,
  }),
  eligible: (d) => ({
    title: 'Your referral rewards are ready',
    body:
      d.available >= d.minPayout
        ? `${naira(d.available)} is ready to withdraw. Add your bank details and request a payout in Settings → Refer & Earn.`
        : `${naira(d.available)} is ready. You can request a payout once you reach ${naira(d.minPayout)}.`,
  }),
  payout_approved: (d) => ({ title: 'Payout approved', body: `Your ${naira(d.amount)} payout was approved. We'll send it to your bank account shortly.` }),
  payout_rejected: (d) => ({
    title: 'Payout not approved',
    body: `Your ${naira(d.amount)} payout request was not approved${d.reason ? `: ${d.reason}` : ''}. The rewards are back in your balance.`,
  }),
  payout_paid: (d) => ({ title: 'Payout sent 💸', body: `We've sent ${naira(d.amount)} to your bank account (reference ${d.reference}).` }),
};

const notify = (email, kind, data) => {
  const msg = MESSAGES[kind]?.(data);
  if (!msg) return;
  const { notifyByEmail } = require('./notification.service');
  notifyByEmail(email, msg.title, msg.body, { type: 'referral' }).catch(() => {});
  const { sendEmail, brandLayout, escapeHtml, SITE_URL } = require('./emailService');
  User.findOne({ email }, 'name').lean().then((u) => {
    const first = escapeHtml(String(u?.name || '').trim().split(' ')[0] || 'there');
    const html = brandLayout({
      label: 'Refer & Earn',
      heading: escapeHtml(msg.title),
      paragraphs: [`Hi ${first},`, escapeHtml(msg.body)],
      button: { text: 'Open Refer & Earn', url: `${SITE_URL().replace(/\/+$/, '')}/dashboard/settings?panel=referral` },
    });
    return sendEmail(`referral-${kind}`, email, msg.title, html, `Hi ${first},\n\n${msg.body}`);
  }).catch(() => {});
};

// ── Scheduler ─────────────────────────────────────────────────────────────

const startReferralScheduler = () => {
  cron.schedule('0 10 * * *', () => releaseHeldRewards().catch((e) => console.error('[referral] release failed:', e.message)), { timezone: 'Africa/Lagos' });
};

module.exports = {
  getSettings,
  rewardFor,
  getOrCreateAccount,
  lookupCode,
  recordClick,
  attachAtSignup,
  onPaymentSuccess,
  releaseHeldRewards,
  balances,
  saveBankDetails,
  requestPayout,
  updatePayout,
  reverseReward,
  reviewReferral,
  startReferralScheduler,
  normCode,
};
