/**
 * Refer & Earn for users: /api/referral
 * Team members see and earn for their own login? No: referrals belong to the business owner
 * (req.effectiveEmail), the account that pays the bills.
 */
const ref = require('../services/referral.service');
const { Referral, ReferralPayout, ReferralClick } = require('../models/Referral');

const fail = (res, error) => res.status(error.status || 500).json({ success: false, error: error.message });
const ownerOf = (req) => String(req.effectiveEmail || req.user?.email || '').toLowerCase();
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
const siteUrl = () => String(process.env.FRONTEND_URL || 'https://www.fashiontally.com').replace(/\/+$/, '');

// GET /api/referral/me — everything the Refer & Earn page shows
const getMine = async (req, res) => {
  try {
    const email = ownerOf(req);
    const [settings, account] = await Promise.all([ref.getSettings(), ref.getOrCreateAccount(email)]);
    const [money, clicks, referrals, payouts] = await Promise.all([
      ref.balances(email),
      ReferralClick.countDocuments({ code: account.code }),
      Referral.find({ referrerEmail: email }).sort({ createdAt: -1 }).limit(200).lean(),
      ReferralPayout.find({ email }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const paid = referrals.filter((r) => r.status === 'paid');
    res.json({
      success: true,
      data: {
        enabled: settings.enabled,
        code: account.code,
        link: `${siteUrl()}/signup?ref=${account.code}`,
        rewards: settings.rewards,
        minPayout: settings.minPayout,
        holdDays: settings.holdDays,
        yearlyQualifies: settings.yearlyQualifies !== false,
        suspended: account.suspended,
        stats: {
          clicks,
          signups: referrals.length,
          paid: paid.length,
          waitingToPay: referrals.filter((r) => r.status === 'registered').length,
          firstPayment: referrals.filter((r) => r.status === 'first_payment').length,
        },
        money,
        canRequestPayout: !account.suspended && money.available >= settings.minPayout && !payouts.some((p) => ['requested', 'approved'].includes(p.status)),
        bank: account.bank?.accountNumber
          ? { bankName: account.bank.bankName, accountName: account.bank.accountName, accountNumberEnd: account.bank.accountNumber.slice(-4) }
          : null,
        referrals: referrals.map((r) => ({
          id: String(r._id),
          name: (r.referredName || 'New user').split(' ')[0],
          joinedAt: r.createdAt,
          status: r.status,
          plan: r.plan,
          reward: r.reward,
          // "review" = flagged or on hold: the reward waits for our team (users don't see the reason)
          rewardStatus: ['pending', 'eligible'].includes(r.rewardStatus) && ['needs_review', 'on_hold'].includes(r.review) ? 'review' : r.rewardStatus,
          eligibleAt: r.eligibleAt,
        })),
        payouts: payouts.map((p) => ({ id: String(p._id), amount: p.amount, status: p.status, reference: p.reference, rejectReason: p.rejectReason, requestedAt: p.createdAt, paidAt: p.paidAt })),
      },
    });
  } catch (error) {
    fail(res, error);
  }
};

// PUT /api/referral/bank  { bankName, accountNumber, accountName }
const saveBank = async (req, res) => {
  try {
    const bank = await ref.saveBankDetails(ownerOf(req), req.body || {});
    res.json({ success: true, data: { bankName: bank.bankName, accountName: bank.accountName, accountNumberEnd: bank.accountNumber.slice(-4) } });
  } catch (error) {
    fail(res, error);
  }
};

// POST /api/referral/payout
const requestPayout = async (req, res) => {
  try {
    const p = await ref.requestPayout(ownerOf(req));
    res.status(201).json({ success: true, data: { id: String(p._id), amount: p.amount, status: p.status } });
  } catch (error) {
    fail(res, error);
  }
};

// GET /api/referral/check/:code — public: is this code valid, and whose is it
const checkCode = async (req, res) => {
  try {
    const settings = await ref.getSettings();
    const found = settings.enabled ? await ref.lookupCode(req.params.code) : null;
    res.json({ success: true, data: found ? { valid: true, code: found.code, name: found.name } : { valid: false } });
  } catch (error) {
    fail(res, error);
  }
};

// POST /api/referral/click  { code } — public: someone opened a referral link
const click = async (req, res) => {
  try {
    await ref.recordClick(req.body?.code, clientIp(req), String(req.headers['user-agent'] || ''));
  } catch {
    /* counting is best effort */
  }
  res.json({ success: true });
};

module.exports = { getMine, saveBank, requestPayout, checkCode, click, clientIp };
