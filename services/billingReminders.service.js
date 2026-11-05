/**
 * services/billingReminders.service.js
 *
 * Daily emails about trials and paid plans ending:
 *   trial: once in its last 48 hours ("ends soon"), and once it has ended
 *   paid:  3 days before, 1 day before, and once it has expired
 * Paid plans also get a push notification (owner's devices only).
 *
 * Each reminder is sent once per subscriptionEndDate (see notificationOnce), so a
 * renewal starts a fresh set. "Ended" emails only go out within 2 days of the
 * end date, so subscriptions that lapsed long ago are never emailed.
 */

const cron = require('node-cron');
const User = require('../models/User');
const { sendBillingReminderEmail } = require('./emailService');
const { sendOnce } = require('./notificationOnce');
const { sendNotification } = require('./notification.service');

const HOUR = 60 * 60 * 1000;
const ENDED_GRACE_HOURS = 48;

const formatDay = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

/** Push text for paid-plan reminders (trials get email only). */
const PLAN_PUSHES = {
  plan_3d: (u, days, end) => ({ title: '⏳ Your plan ends soon', body: `Your ${u.planType || 'FashionTally'} plan ends in ${days} days (${formatDay(end)}). Renew to keep everything running.`, type: 'plan_ending' }),
  plan_1d: (u, days, end) => ({ title: '⏳ Your plan ends tomorrow', body: `Your ${u.planType || 'FashionTally'} plan ends on ${formatDay(end)}. Renew now to avoid losing access.`, type: 'plan_ending' }),
  plan_expired: (u, days, end) => ({ title: '⚠️ Your plan has expired', body: `Your ${u.planType || 'FashionTally'} plan expired on ${formatDay(end)}. Renew to pick up where you left off.`, type: 'plan_expired' }),
};

/** Which reminder (if any) applies `hoursLeft` before the end date. */
const reminderFor = (subscriptionType, hoursLeft) => {
  // Trials are short (see config/trial.js), so they get a single "ends soon" reminder
  if (subscriptionType === 'trial') {
    if (hoursLeft > 48) return null;
    if (hoursLeft > 0) return 'trial_ending';
    return hoursLeft > -ENDED_GRACE_HOURS ? 'trial_ended' : null;
  }
  if (hoursLeft > 72) return null;
  if (hoursLeft > 24) return 'plan_3d';
  if (hoursLeft > 0) return 'plan_1d';
  if (hoursLeft > -ENDED_GRACE_HOURS) return 'plan_expired';
  return null;
};

const runBillingReminders = async (now = new Date()) => {
  console.log('[billing-reminders] ── Run started ─────────────────────');
  const users = await User.find({
    subscriptionType: { $in: ['trial', 'paid'] },
    subscriptionEndDate: { $nin: [null, ''] },
  }).select('_id email name planType subscriptionType subscriptionEndDate').lean();

  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const user of users) {
    const endDate = new Date(user.subscriptionEndDate);
    if (!user.email || isNaN(endDate)) continue;

    const hoursLeft = (endDate - now) / HOUR;
    const kind = reminderFor(user.subscriptionType, hoursLeft);
    if (!kind) continue;

    const daysLeft = Math.max(1, Math.ceil(hoursLeft / 24));
    try {
      const outcome = await sendOnce(
        { email: user.email, kind, key: endDate.toISOString() },
        () => sendBillingReminderEmail(kind, user.email, {
          name:     user.name,
          planType: user.planType,
          endDate,
          daysLeft,
        }),
      );
      counts[outcome] += 1;

      const push = PLAN_PUSHES[kind]?.(user, daysLeft, endDate);
      if (push) {
        await sendOnce({ email: user.email, kind: `push:${kind}`, key: endDate.toISOString() }, async () => {
          await sendNotification(String(user._id), push.title, push.body, { type: push.type }, { audience: 'owner' });
          return { success: true };
        });
      }
    } catch (error) {
      counts.failed += 1;
      console.error(`[billing-reminders] ${user.email}:`, error.message);
    }
  }

  console.log(`[billing-reminders] Done — sent ${counts.sent}, already sent ${counts.skipped}, failed ${counts.failed}`);
  return counts;
};

/**
 * Runs every day at 09:00 Lagos time. Off when NODE_ENV=development so a local
 * backend pointed at the live database never emails customers; override with
 * BILLING_REMINDERS_ENABLED=true|false.
 */
function startBillingReminderScheduler() {
  const flag = process.env.BILLING_REMINDERS_ENABLED;
  const enabled = flag ? flag === 'true' : process.env.NODE_ENV !== 'development';
  if (!enabled) {
    console.log('⏸️  Billing reminder emails disabled (NODE_ENV=development or BILLING_REMINDERS_ENABLED=false)');
    return;
  }

  cron.schedule('0 9 * * *', () => {
    runBillingReminders().catch((err) => console.error('[billing-reminders] Unhandled error:', err));
  }, { timezone: 'Africa/Lagos' });
  console.log('✅ Billing reminder scheduler started (09:00 Lagos time)');
}

module.exports = { startBillingReminderScheduler, runBillingReminders, reminderFor };
