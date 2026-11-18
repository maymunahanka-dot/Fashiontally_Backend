/**
 * Admin home page numbers: FashionTally's own business (sign-ups, plans, the money
 * users pay FashionTally), not the users' private bookkeeping or client data.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const SupportTicket = require('../models/SupportTicket');
const ContactMessage = require('../models/ContactMessage');
const DemoRequest = require('../models/DemoRequest');
const { subscriptionSummary } = require('../services/subscriptionSummary');

const DAY = 24 * 60 * 60 * 1000;
const toMs = (v) => {
  const ms = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};
const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const monthKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const top = (counts, n) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));

/** Owner emails that have at least one client or order (to spot users who never got started). */
const emailsWithData = async () => {
  const db = mongoose.connection.db;
  const sets = await Promise.all(
    ['fashiontally_clients', 'fashiontally_orders'].flatMap((c) =>
      ['userEmail', 'tailorId'].map((f) => db.collection(c).distinct(f).catch(() => []))
    )
  );
  return new Set(sets.flat().filter(Boolean).map((e) => String(e).toLowerCase()));
};

const getDashboardStats = async (req, res) => {
  try {
    const now = Date.now();
    const today = startOfDay(now);
    const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
    const lastMonthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - 1, 1).getTime();

    const [users, payments, openTickets, unreadContacts, unreadDemos, withData, adminActions] = await Promise.all([
      User.find(
        {},
        'name email createdAt country language lastLoginAt subscriptionType planType subscriptionEndDate ' +
          'subscriptionStartDate trialStartDate billingCycle payment_amount payment_date isSubscribed fcmTokens.platform'
      ).lean(),
      Payment.find({}, 'id email name plantype planPrice billingCycle status gateway paidAt createdAt').lean(),
      SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      ContactMessage.countDocuments({ seen: { $ne: true } }),
      DemoRequest.countDocuments({ seen: { $ne: true } }),
      emailsWithData(),
      User.aggregate([
        { $match: { 'adminLog.0': { $exists: true } } },
        { $project: { name: 1, email: 1, adminLog: 1 } },
        { $unwind: '$adminLog' },
        { $sort: { 'adminLog.at': -1 } },
        { $limit: 8 },
      ]),
    ]);

    // ── Users and plans ───────────────────────────────────────────
    const signupsByDay = {};
    for (let i = 29; i >= 0; i -= 1) signupsByDay[dayKey(today - i * DAY)] = 0;

    const countries = {};
    const languages = { en: 0, fr: 0 };
    const platforms = { android: 0, ios: 0, web: 0 };
    const planMix = { Starter: 0, Growth: 0, Professional: 0 };
    let activePaid = 0;
    let activeTrial = 0;
    let expiringSoon = 0;
    let expiredRecently = 0;
    let signupsToday = 0;
    let signups7 = 0;
    let signups30 = 0;
    let signupsPrev30 = 0;
    let loggedIn7 = 0;
    let loggedIn30 = 0;
    let newNoData = 0;
    const expiringList = [];

    for (const u of users) {
      const created = toMs(u.createdAt);
      if (Number.isFinite(created)) {
        if (created >= today) signupsToday += 1;
        if (created >= now - 7 * DAY) signups7 += 1;
        if (created >= now - 30 * DAY) {
          signups30 += 1;
          if (!withData.has(String(u.email).toLowerCase())) newNoData += 1;
        } else if (created >= now - 60 * DAY) signupsPrev30 += 1;
        const k = dayKey(created);
        if (k in signupsByDay) signupsByDay[k] += 1;
      }

      const login = toMs(u.lastLoginAt);
      if (login >= now - 7 * DAY) loggedIn7 += 1;
      if (login >= now - 30 * DAY) loggedIn30 += 1;

      const country = String(u.country || '').trim() || 'Not set';
      countries[country] = (countries[country] || 0) + 1;
      languages[u.language === 'fr' ? 'fr' : 'en'] += 1;
      for (const d of u.fcmTokens || []) if (d.platform in platforms) platforms[d.platform] += 1;

      const sum = subscriptionSummary(u, now);
      if (sum.status === 'active') {
        activePaid += 1;
        if (sum.plan in planMix) planMix[sum.plan] += 1;
      } else if (sum.status === 'trial') {
        activeTrial += 1;
      }
      if (sum.isActive && sum.daysLeft <= 7) {
        expiringSoon += 1;
        expiringList.push({
          name: u.name || u.email,
          email: u.email,
          status: sum.status,
          plan: sum.plan,
          daysLeft: sum.daysLeft,
          endDate: sum.endDate,
        });
      }
      const ended = toMs(sum.endDate);
      if (!sum.isActive && (sum.status === 'expired' || sum.status === 'trial_ended') && ended >= now - 30 * DAY) {
        expiredRecently += 1;
      }
    }
    expiringList.sort((a, b) => a.daysLeft - b.daysLeft);

    // ── Money FashionTally received ─────────────────────────────────
    const successful = payments.filter((p) => p.status === 'successful');
    const paidAt = (p) => toMs(p.paidAt || p.createdAt);
    const revenueByMonth = {};
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - i, 1);
      revenueByMonth[monthKey(d.getTime())] = 0;
    }
    let revenueThisMonth = 0;
    let revenueLastMonth = 0;
    let revenueTotal = 0;
    const payingEmails = new Set();
    for (const p of successful) {
      const amount = Number(p.planPrice) || 0;
      const at = paidAt(p);
      revenueTotal += amount;
      payingEmails.add(String(p.email || '').toLowerCase());
      if (at >= monthStart) revenueThisMonth += amount;
      else if (at >= lastMonthStart) revenueLastMonth += amount;
      if (Number.isFinite(at) && monthKey(at) in revenueByMonth) revenueByMonth[monthKey(at)] += amount;
    }
    const failedRecent = payments
      .filter((p) => p.status === 'failed' && paidAt(p) >= now - 30 * DAY)
      .sort((a, b) => paidAt(b) - paidAt(a));

    const byRecent = (list, at) => [...list].sort((a, b) => (at(b) || 0) - (at(a) || 0));
    const statusOf = (u) => {
      const sum = subscriptionSummary(u, now);
      return { status: !u.subscriptionType && !sum.endDate ? 'free' : sum.status, plan: sum.plan };
    };

    res.json({
      success: true,
      data: {
        generatedAt: new Date(now).toISOString(),
        kpis: {
          totalUsers: users.length,
          signupsToday,
          signups7,
          signups30,
          signupsPrev30,
          activePaid,
          activeTrial,
          payingUsers: payingEmails.size,
          payingShare: users.length ? payingEmails.size / users.length : 0,
          revenueThisMonth,
          revenueLastMonth,
          revenueTotal,
          loggedIn7,
          loggedIn30,
          newNoData,
        },
        attention: {
          expiringSoon,
          expiredRecently,
          failedPayments: failedRecent.length,
          openTickets,
          unreadContacts,
          unreadDemos,
        },
        charts: {
          signupsByDay: Object.entries(signupsByDay).map(([date, count]) => ({ date, count })),
          revenueByMonth: Object.entries(revenueByMonth).map(([month, amount]) => ({ month, amount })),
          planMix: [
            ...Object.entries(planMix).map(([label, count]) => ({ label, count })),
            { label: 'Trial', count: activeTrial },
          ],
        },
        breakdown: {
          countries: top(countries, 8),
          languages,
          platforms,
        },
        lists: {
          expiring: expiringList.slice(0, 6),
          recentSignups: byRecent(users, (u) => toMs(u.createdAt))
            .slice(0, 6)
            .map((u) => ({ name: u.name || u.email, email: u.email, country: u.country || '', createdAt: u.createdAt, ...statusOf(u) })),
          recentPayments: byRecent(successful, paidAt)
            .slice(0, 6)
            .map((p) => ({
              id: p.id,
              name: p.name || p.email,
              email: p.email,
              amount: Number(p.planPrice) || 0,
              plan: p.plantype,
              billingCycle: p.billingCycle,
              paidAt: p.paidAt || p.createdAt,
            })),
          failedPayments: failedRecent.slice(0, 5).map((p) => ({
            id: p.id,
            name: p.name || p.email,
            email: p.email,
            amount: Number(p.planPrice) || 0,
            plan: p.plantype,
            at: p.paidAt || p.createdAt,
          })),
          adminActions: adminActions.map((a) => ({
            name: a.name || a.email,
            email: a.email,
            action: a.adminLog.action,
            details: a.adminLog.details,
            admin: a.adminLog.admin,
            at: a.adminLog.at,
          })),
        },
      },
    });
  } catch (error) {
    console.error('❌ Admin dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getDashboardStats };
