const User = require('../models/User');
const { sendSubscriptionCancelledEmail } = require('../services/emailService');
const { sendNotification } = require('../services/notification.service');

const Payment = require('../models/Payment');
const { subscriptionSummary } = require('../services/subscriptionSummary');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Emails may have been saved with capitals: match them whatever the case. */
const byEmail = (email) => ({ email: new RegExp(`^${escapeRegex(String(email).trim())}$`, 'i') });
const adminName = (req) => req.admin?.label || 'Admin';
const logEntry = (req, action, details, note) => ({
  action,
  details,
  note: String(note || '').trim().slice(0, 500),
  admin: adminName(req),
  at: new Date().toISOString(),
});

const paidAtMs = (p) => {
  const ms = new Date(p.paidAt || p.createdAt).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

/** Successful payments, and the same grouped by email (lower-case). */
const paymentsByEmail = async () => {
  const payments = await Payment.find({ status: 'successful' }).lean();
  const map = new Map();
  for (const p of payments) {
    const key = String(p.email || '').toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return { payments, map };
};

// GET all users with subscription data (status worked out the same way the apps do)
const getSubscriptions = async (req, res) => {
  try {
    const [users, { payments, map }] = await Promise.all([
      User.find({}, '-fcmTokens').sort({ createdAt: -1 }).lean(),
      paymentsByEmail(),
    ]);
    const now = Date.now();

    const usersList = users.map((u) => {
      const sum = subscriptionSummary(u, now);
      const own = map.get(String(u.email || '').toLowerCase()) || [];
      const lastPayment = own.reduce((last, p) => (!last || paidAtMs(p) > paidAtMs(last) ? p : last), null);
      return {
        id: u._id.toString(),
        email: u.email,
        name: u.name || 'Unknown User',
        phone: u.phone || u.phoneNumber || '',
        role: u.role || 'Designer',
        createdAt: u.createdAt,
        // 'trial' | 'active' | 'trial_ended' | 'expired' | 'cancelled' | 'free'
        status: !u.subscriptionType && !sum.endDate ? 'free' : sum.status,
        isActive: sum.isActive,
        subscriptionType: u.subscriptionType || 'free',
        planType: sum.plan,
        billingCycle: sum.billingCycle,
        subscriptionStartDate: sum.startDate,
        subscriptionEndDate: sum.endDate,
        daysLeft: sum.daysLeft,
        lastPaymentAmount: lastPayment ? Number(lastPayment.planPrice) || 0 : Number(u.payment_amount) || 0,
        lastPaymentDate: lastPayment ? lastPayment.paidAt || lastPayment.createdAt : u.payment_date || null,
        totalPaid: own.reduce((t, p) => t + (Number(p.planPrice) || 0), 0),
        paymentCount: own.length,
        adminLog: (u.adminLog || []).slice(-5),
      };
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const revenueThisMonth = payments
      .filter((p) => paidAtMs(p) >= monthStart.getTime())
      .reduce((t, p) => t + (Number(p.planPrice) || 0), 0);

    const stats = {
      totalUsers: usersList.length,
      activePaid: usersList.filter((u) => u.status === 'active').length,
      activeTrial: usersList.filter((u) => u.status === 'trial').length,
      expired: usersList.filter((u) => u.status === 'expired' || u.status === 'trial_ended').length,
      expiringSoon: usersList.filter((u) => u.isActive && u.daysLeft <= 7).length,
      revenueThisMonth,
      revenueTotal: payments.reduce((t, p) => t + (Number(p.planPrice) || 0), 0),
    };
    // kept for older admin builds
    stats.subscribedUsers = stats.activePaid + stats.activeTrial;
    stats.trialUsers = stats.activeTrial;
    stats.monthlyRevenue = revenueThisMonth;

    res.json({ success: true, data: { users: usersList, stats } });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET one user's payments and admin actions
const getSubscriptionHistory = async (req, res) => {
  try {
    const email = String(req.query.email || '').trim();
    if (!email) return res.status(400).json({ success: false, error: 'email is required' });
    const [user, payments] = await Promise.all([
      User.findOne(byEmail(email), 'email name adminLog').lean(),
      Payment.find(byEmail(email)).lean(),
    ]);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    payments.sort((a, b) => (paidAtMs(b) || 0) - (paidAtMs(a) || 0));
    res.json({
      success: true,
      data: {
        payments: payments.map((p) => ({
          id: p.id,
          amount: Number(p.planPrice) || 0,
          plan: p.plantype,
          billingCycle: p.billingCycle,
          status: p.status,
          gateway: p.gateway,
          reference: p.providerTransactionId || p.transactionId || '',
          paidAt: p.paidAt || p.createdAt,
        })),
        adminLog: (user.adminLog || []).slice().reverse(),
      },
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST grant free time.
 * - Active paid plan: the months are added to the end of the paid plan (never cut short).
 * - Active trial: the months are added to the end of the trial.
 * - Otherwise: a new trial starts today.
 */
const grantTrial = async (req, res) => {
  try {
    const { email, planType, notes } = req.body;
    const months = parseInt(req.body.months, 10);
    if (!email || !planType || !months) {
      return res.status(400).json({ success: false, error: 'email, planType and months are required' });
    }
    if (months < 1 || months > 24) {
      return res.status(400).json({ success: false, error: 'months must be between 1 and 24' });
    }

    const user = await User.findOne(byEmail(email));
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const sum = subscriptionSummary(user);
    const now = new Date();
    const from = sum.isActive && sum.endDate ? new Date(sum.endDate) : now;
    const endDate = new Date(from);
    endDate.setMonth(endDate.getMonth() + months);
    const endDay = endDate.toISOString().slice(0, 10);

    let set;
    let details;
    let message;
    if (sum.status === 'active') {
      set = { subscriptionEndDate: endDate.toISOString(), isSubscribed: true };
      details = `Added ${months} free month(s) to paid ${sum.plan} plan (now ends ${endDay})`;
      message = `${months} free month(s) added to ${user.name}'s paid ${sum.plan} plan`;
    } else if (sum.status === 'trial') {
      set = { subscriptionEndDate: endDate.toISOString(), planType, isSubscribed: true, isTrialActive: true };
      details = `Extended trial by ${months} month(s) on ${planType} (now ends ${endDay})`;
      message = `Trial extended for ${user.name}`;
    } else {
      set = {
        isSubscribed: true,
        subscriptionType: 'trial',
        planType,
        subscriptionEndDate: endDate.toISOString(),
        trialStartDate: now.toISOString(),
        isTrialActive: true,
      };
      details = `Granted ${months}-month ${planType} trial (ends ${endDay})`;
      message = `Trial granted to ${user.name}`;
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: { ...set, updatedAt: now.toISOString() },
        $push: { adminLog: logEntry(req, 'grant_trial', details, notes) },
      }
    );
    res.json({ success: true, message, details });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST cancel subscription (ends access straight away; payments are one-off, nothing renews)
const cancelSubscription = async (req, res) => {
  try {
    const { email, notes } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email is required' });

    const previous = await User.findOne(byEmail(email));
    if (!previous) return res.status(404).json({ success: false, error: 'User not found' });

    const sum = subscriptionSummary(previous);
    if (!sum.isActive) {
      return res.status(400).json({ success: false, error: 'This user has no active subscription to cancel' });
    }

    await User.updateOne(
      { _id: previous._id },
      {
        $set: {
          isSubscribed: false,
          subscriptionType: 'free',
          planType: 'Free',
          isTrialActive: false,
          subscriptionEndDate: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $push: {
          adminLog: logEntry(
            req,
            'cancel',
            `Cancelled ${sum.status === 'trial' ? 'trial' : 'paid'} ${sum.plan} plan with ${sum.daysLeft} day(s) left`,
            notes
          ),
        },
      }
    );

    res.json({ success: true, message: `Subscription cancelled for ${previous.name}` });
    sendSubscriptionCancelledEmail(previous.email, { name: previous.name, planType: sum.plan, byAdmin: true });
    sendNotification(
      String(previous._id),
      'Subscription cancelled',
      `Your ${sum.plan || 'FashionTally'} subscription was cancelled by our team. Contact support if this is a mistake.`,
      { type: 'subscription_cancelled' },
      { audience: 'owner' },
    ).catch(() => {});
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST recover a Flutterwave payment that never reached FashionTally
const recoverPayment = async (req, res) => {
  try {
    const transactionId = req.body.transactionId || req.body.transaction_id;
    const email = req.body.email || '';
    const planType = req.body.planType || req.body.plantype || '';

    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'Flutterwave transactionId is required' });
    }

    const { verifyAndActivate } = require('../services/flutterwavePayment.service');
    const result = await verifyAndActivate({
      transactionId,
      email,
      planType,
      allowEmailOverride: Boolean(email),
    });

    res.json({
      success: true,
      message: result.message,
      alreadyProcessed: result.alreadyProcessed,
      data: {
        email: result.user?.email,
        name: result.user?.name,
        planType: result.user?.planType,
        subscriptionEndDate: result.user?.subscriptionEndDate,
        paymentAmount: result.payment?.planPrice,
      },
    });
  } catch (error) {
    console.error('❌ recoverPayment:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
};

module.exports = { getSubscriptions, getSubscriptionHistory, grantTrial, cancelSubscription, recoverPayment };
