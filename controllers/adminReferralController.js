/**
 * Admin: Refer & Earn management (/api/admin/referrals)
 * Overview and reports, participants, referrals, payout requests (approve / reject / mark paid
 * with the transfer reference), reversing rewards, suspending accounts, settings, CSV export.
 * Bank details are only returned here (admin token required).
 */
const ref = require('../services/referral.service');
const { ReferralAccount, Referral, ReferralPayout, ReferralClick, ReferralSetting } = require('../models/Referral');
const User = require('../models/User');

const fail = (res, error) => res.status(error.status || 500).json({ success: false, error: error.message });
const adminName = (req) => req.admin?.label || 'admin';

// GET /overview — reporting numbers
const overview = async (req, res) => {
  try {
    const [settings, participants, clicks, refs, payouts, top] = await Promise.all([
      ref.getSettings(),
      ReferralAccount.countDocuments(),
      ReferralClick.countDocuments(),
      Referral.aggregate([
        {
          $group: {
            _id: null,
            signups: { $sum: 1 },
            paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
            firstPayment: { $sum: { $cond: [{ $eq: ['$status', 'first_payment'] }, 1, 0] } },
            needsReview: { $sum: { $cond: [{ $eq: ['$review', 'needs_review'] }, 1, 0] } },
            onHold: { $sum: { $cond: [{ $eq: ['$review', 'on_hold'] }, 1, 0] } },
            revenue: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amountPaid', 0] } },
            generated: { $sum: { $cond: [{ $in: ['$rewardStatus', ['pending', 'eligible', 'paid']] }, '$reward', 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$rewardStatus', 'pending'] }, '$reward', 0] } },
            owed: { $sum: { $cond: [{ $eq: ['$rewardStatus', 'eligible'] }, '$reward', 0] } },
            paidOut: { $sum: { $cond: [{ $eq: ['$rewardStatus', 'paid'] }, '$reward', 0] } },
            starter: { $sum: { $cond: [{ $eq: ['$plan', 'STARTER'] }, 1, 0] } },
            growth: { $sum: { $cond: [{ $eq: ['$plan', 'GROWTH'] }, 1, 0] } },
            professional: { $sum: { $cond: [{ $eq: ['$plan', 'PROFESSIONAL'] }, 1, 0] } },
          },
        },
      ]),
      ReferralPayout.aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
      Referral.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: '$referrerEmail', paid: { $sum: 1 }, earned: { $sum: { $cond: [{ $ne: ['$rewardStatus', 'reversed'] }, '$reward', 0] } } } },
        { $sort: { paid: -1, earned: -1 } },
        { $limit: 5 },
      ]),
    ]);
    const r = refs[0] || {};
    const p = Object.fromEntries(payouts.map((x) => [x._id, { count: x.n, amount: x.amount }]));
    res.json({
      success: true,
      data: {
        settings,
        participants,
        clicks,
        signups: r.signups || 0,
        paidReferrals: r.paid || 0,
        firstPayment: r.firstPayment || 0,
        needsReview: r.needsReview || 0,
        onHold: r.onHold || 0,
        conversion: r.signups ? Math.round((r.paid / r.signups) * 1000) / 10 : 0,
        revenue: r.revenue || 0,
        rewardsGenerated: r.generated || 0,
        rewardsPending: r.pending || 0,
        rewardsOwed: r.owed || 0,
        rewardsPaid: r.paidOut || 0,
        plans: { STARTER: r.starter || 0, GROWTH: r.growth || 0, PROFESSIONAL: r.professional || 0 },
        payouts: p,
        topReferrers: top.map((t) => ({ email: t._id, paid: t.paid, earned: t.earned })),
      },
    });
  } catch (error) {
    fail(res, error);
  }
};

// GET /participants?q= — everyone with a code, with their numbers
const participants = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = q ? { $or: [{ email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { code: q.toUpperCase() }] } : {};
    const accounts = await ReferralAccount.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const emails = accounts.map((a) => a.email);
    const [stats, clicks, users] = await Promise.all([
      Referral.aggregate([
        { $match: { referrerEmail: { $in: emails } } },
        {
          $group: {
            _id: '$referrerEmail',
            signups: { $sum: 1 },
            paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$rewardStatus', 'pending'] }, '$reward', 0] } },
            available: { $sum: { $cond: [{ $and: [{ $eq: ['$rewardStatus', 'eligible'] }, { $eq: ['$payoutId', null] }] }, '$reward', 0] } },
            paidOut: { $sum: { $cond: [{ $eq: ['$rewardStatus', 'paid'] }, '$reward', 0] } },
          },
        },
      ]),
      ReferralClick.aggregate([{ $match: { code: { $in: accounts.map((a) => a.code) } } }, { $group: { _id: '$code', n: { $sum: 1 } } }]),
      User.find({ email: { $in: emails } }, 'email name businessName').lean(),
    ]);
    const byEmail = new Map(stats.map((s) => [s._id, s]));
    const clicksByCode = new Map(clicks.map((c) => [c._id, c.n]));
    const names = new Map(users.map((u) => [String(u.email).toLowerCase(), u.businessName || u.name]));
    const settings = await ref.getSettings();
    res.json({
      success: true,
      data: accounts.map((a) => {
        const s = byEmail.get(a.email) || {};
        return {
          email: a.email,
          name: names.get(a.email) || '',
          code: a.code,
          clicks: clicksByCode.get(a.code) || 0,
          signups: s.signups || 0,
          paid: s.paid || 0,
          pending: s.pending || 0,
          available: s.available || 0,
          paidOut: s.paidOut || 0,
          eligibleForPayout: (s.available || 0) >= settings.minPayout,
          bank: a.bank?.accountNumber ? a.bank : null,
          suspended: a.suspended,
          suspendedReason: a.suspendedReason,
          flags: a.flags,
          joinedAt: a.createdAt,
        };
      }),
    });
  } catch (error) {
    fail(res, error);
  }
};

// GET /referrals?status=&rewardStatus=&review=&referrer=
const referrals = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.rewardStatus) filter.rewardStatus = String(req.query.rewardStatus);
    if (req.query.review) filter.review = String(req.query.review);
    if (req.query.referrer) filter.referrerEmail = String(req.query.referrer).toLowerCase();
    const rows = await Referral.find(filter).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows.map(({ __v, ...r }) => ({ ...r, id: String(r._id) })) });
  } catch (error) {
    fail(res, error);
  }
};

// GET /payouts?status=
const payouts = async (req, res) => {
  try {
    const filter = req.query.status ? { status: String(req.query.status) } : {};
    const rows = await ReferralPayout.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, data: rows.map(({ __v, ...p }) => ({ ...p, id: String(p._id) })) });
  } catch (error) {
    fail(res, error);
  }
};

// POST /payouts/:id/:action  (approve | reject | paid)  { reference?, reason? }
const payoutAction = async (req, res) => {
  try {
    const p = await ref.updatePayout(req.params.id, req.params.action, { by: adminName(req), reference: req.body?.reference, reason: req.body?.reason });
    console.log(`[referral] ${adminName(req)} ${req.params.action} payout ${req.params.id}`);
    res.json({ success: true, data: { ...p, id: String(p._id) } });
  } catch (error) {
    fail(res, error);
  }
};

// POST /referrals/:id/reverse  { reason }
const reverse = async (req, res) => {
  try {
    await ref.reverseReward(req.params.id, { by: adminName(req), reason: req.body?.reason });
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

// POST /referrals/:id/review/:action  (approve | hold | reject)  { reason }
const review = async (req, res) => {
  try {
    const r = await ref.reviewReferral(req.params.id, req.params.action, { by: adminName(req), reason: req.body?.reason });
    console.log(`[referral] ${adminName(req)} ${req.params.action} referral ${req.params.id}`);
    const { __v, ...rest } = r;
    res.json({ success: true, data: { ...rest, id: String(r._id) } });
  } catch (error) {
    fail(res, error);
  }
};

// POST /participants/:email/suspend  { suspended: bool, reason }
const suspend = async (req, res) => {
  try {
    const suspended = Boolean(req.body?.suspended);
    const reason = String(req.body?.reason || '').slice(0, 300);
    const r = await ReferralAccount.updateOne(
      { email: String(req.params.email).toLowerCase() },
      { $set: { suspended, suspendedReason: suspended ? reason : '' }, $push: { audit: { by: adminName(req), action: suspended ? 'suspended' : 'unsuspended', note: reason } } }
    );
    if (!r.matchedCount) return fail(res, Object.assign(new Error('Participant not found'), { status: 404 }));
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

// PUT /settings  { enabled?, rewards?: {STARTER, GROWTH, PROFESSIONAL}, minPayout?, holdDays? }
const updateSettings = async (req, res) => {
  try {
    await ref.getSettings();
    const $set = { updatedAt: new Date(), updatedBy: adminName(req) };
    const b = req.body || {};
    if (typeof b.enabled === 'boolean') $set.enabled = b.enabled;
    for (const plan of ['STARTER', 'GROWTH', 'PROFESSIONAL']) {
      if (b.rewards?.[plan] != null) {
        const v = Number(b.rewards[plan]);
        if (!Number.isFinite(v) || v < 0 || v > 1000000) return fail(res, Object.assign(new Error(`Invalid reward for ${plan}`), { status: 400 }));
        $set[`rewards.${plan}`] = Math.round(v);
      }
    }
    if (b.minPayout != null) $set.minPayout = Math.max(0, Math.round(Number(b.minPayout) || 0));
    if (b.holdDays != null) $set.holdDays = Math.min(90, Math.max(0, Math.round(Number(b.holdDays) || 0)));
    if (b.secondPaymentWindowDays != null) $set.secondPaymentWindowDays = Math.min(120, Math.max(28, Math.round(Number(b.secondPaymentWindowDays) || 45)));
    if (typeof b.yearlyQualifies === 'boolean') $set.yearlyQualifies = b.yearlyQualifies;
    if (b.flagSignupsPerDay != null) $set.flagSignupsPerDay = Math.min(1000, Math.max(2, Math.round(Number(b.flagSignupsPerDay) || 5)));
    if (b.flagSignupsPerMonth != null) $set.flagSignupsPerMonth = Math.min(10000, Math.max(2, Math.round(Number(b.flagSignupsPerMonth) || 20)));
    const s = await ReferralSetting.findOneAndUpdate({ id: 'main' }, { $set }, { new: true }).lean();
    console.log(`[referral] settings changed by ${adminName(req)}:`, JSON.stringify(b));
    res.json({ success: true, data: s });
  } catch (error) {
    fail(res, error);
  }
};

// GET /export?type=referrals|payouts — CSV
const exportCsv = async (req, res) => {
  try {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const date = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    let header;
    let rows;
    if (req.query.type === 'payouts') {
      header = ['Requested', 'Referrer', 'Amount', 'Status', 'Bank', 'Account number', 'Account name', 'Reference', 'Paid on', 'Flags'];
      rows = (await ReferralPayout.find({}).sort({ createdAt: -1 }).lean()).map((p) => [
        date(p.createdAt), p.email, p.amount, p.status, p.bank?.bankName, p.bank?.accountNumber, p.bank?.accountName, p.reference, date(p.paidAt), (p.flags || []).join('; '),
      ]);
    } else {
      header = ['Signed up', 'Referrer', 'Code', 'Referred customer', 'Status', 'Payment 1', 'Payment 2 / qualified', 'Plan', 'Amount paid', 'Reward', 'Reward status', 'Ready on', 'Review', 'Flags'];
      rows = (await Referral.find({}).sort({ createdAt: -1 }).lean()).map((r) => [
        date(r.createdAt), r.referrerEmail, r.code, r.referredEmail, r.status, date(r.firstPaidAt), date(r.paidAt), r.plan, r.amountPaid, r.reward, r.rewardStatus, date(r.eligibleAt), r.review, (r.flags || []).join('; '),
      ]);
    }
    const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="referral-${req.query.type === 'payouts' ? 'payouts' : 'referrals'}-${date(new Date())}.csv"`);
    res.send(`﻿${csv}`);
  } catch (error) {
    fail(res, error);
  }
};

module.exports = { overview, participants, referrals, payouts, payoutAction, reverse, review, suspend, updateSettings, exportCsv };
