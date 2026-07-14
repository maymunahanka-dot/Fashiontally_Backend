

const cron        = require('node-cron');
const User        = require('../models/User');
const Inventory   = require('../models/Inventory');
const Appointment = require('../models/Appointment');
const Order       = require('../models/Order');
const { sendNotification } = require('./notification.service');


/** Return YYYY-MM-DD for today and tomorrow in local server time */
function getTodayTomorrow() {
  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const fmt = (d) => d.toISOString().slice(0, 10); // "2026-07-06"
  return { today: fmt(now), tomorrow: fmt(tomorrow) };
}

/**
 * Strip time from a date string so we can compare only the date part.
 * Handles "2026-07-06", "2026-07-06T10:00:00.000Z", "07/06/2026", etc.
 */
function extractDatePart(str) {
  if (!str) return '';
  // ISO format — just take the first 10 chars
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  // MM/DD/YYYY
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // Try parsing as a date object
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Core job — runs for a single user
// ─────────────────────────────────────────────────────────────────────────────

async function runForUser(user) {
  const email  = user.email;
  const userId = String(user._id);

  try {
    const { today, tomorrow } = getTodayTomorrow();

    // ── 1. Low-stock inventory ──────────────────────────────────────────────
    const allInventory = await Inventory.find({ userEmail: email }).lean();

    const lowStock = allInventory.filter(item => {
      const qty      = item.quantity   ?? 0;
      const reorder  = item.reorderPoint ?? 0;
      // If reorderPoint is set (> 0) use it, otherwise flag anything <= 3
      return reorder > 0 ? qty <= reorder : qty <= 3;
    });

    if (lowStock.length > 0) {
      const names   = lowStock.slice(0, 3).map(i => i.name).join(', ');
      const more    = lowStock.length > 3 ? ` +${lowStock.length - 3} more` : '';
      const title   = `🔴 Low Stock Alert`;
      const body    = lowStock.length === 1
        ? `"${lowStock[0].name}" is running low (${lowStock[0].quantity} ${lowStock[0].unit || 'left'}).`
        : `${lowStock.length} inventory items are low: ${names}${more}.`;

      await sendNotification(userId, title, body, { type: 'low_stock' });
      console.log(`[daily] ✅ Low-stock sent to ${email} (${lowStock.length} items)`);
    }

    // ── 2. Appointments today / tomorrow ───────────────────────────────────
    const upcoming = await Appointment.find({
      userEmail: email,
      status:    { $in: ['Scheduled', 'scheduled', 'Confirmed', 'confirmed'] },
    }).lean();

    const todayAppts    = upcoming.filter(a => extractDatePart(a.date) === today);
    const tomorrowAppts = upcoming.filter(a => extractDatePart(a.date) === tomorrow);
    const totalAppts    = todayAppts.length + tomorrowAppts.length;

    if (totalAppts > 0) {
      let body = '';

      if (todayAppts.length > 0 && tomorrowAppts.length > 0) {
        body = `You have ${todayAppts.length} appointment${todayAppts.length > 1 ? 's' : ''} today`
             + ` and ${tomorrowAppts.length} tomorrow.`;
      } else if (todayAppts.length > 0) {
        const names = todayAppts.slice(0, 2).map(a => a.clientName).filter(Boolean).join(' & ');
        body = todayAppts.length === 1
          ? `Appointment today${names ? ` with ${names}` : ''} at ${todayAppts[0].time || 'scheduled time'}.`
          : `${todayAppts.length} appointments today${names ? ` — ${names}` : ''}.`;
      } else {
        const names = tomorrowAppts.slice(0, 2).map(a => a.clientName).filter(Boolean).join(' & ');
        body = tomorrowAppts.length === 1
          ? `Appointment tomorrow${names ? ` with ${names}` : ''} at ${tomorrowAppts[0].time || 'scheduled time'}.`
          : `${tomorrowAppts.length} appointments tomorrow${names ? ` — ${names}` : ''}.`;
      }

      await sendNotification(userId, '📅 Upcoming Appointments', body, { type: 'appointments' });
      console.log(`[daily] ✅ Appointment alert sent to ${email} (today: ${todayAppts.length}, tomorrow: ${tomorrowAppts.length})`);
    }

    // ── 3. Incomplete orders ────────────────────────────────────────────────
    const COMPLETE_STATUSES = ['completed', 'delivered', 'cancelled', 'canceled'];

    const incompleteOrders = await Order.find({
      userEmail: email,
      status:    { $nin: COMPLETE_STATUSES },
    }).lean();

    if (incompleteOrders.length > 0) {
      const body = incompleteOrders.length === 1
        ? `You have 1 order still in progress for ${incompleteOrders[0].clientName || 'a client'}.`
        : `You have ${incompleteOrders.length} orders that are not yet completed.`;

      await sendNotification(userId, '📦 Pending Orders', body, { type: 'pending_orders' });
      console.log(`[daily] ✅ Pending-orders alert sent to ${email} (${incompleteOrders.length} orders)`);
    }

  } catch (err) {
    console.error(`[daily] ❌ Error processing user ${email}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main job — fetches all users with tokens, runs for each
// ─────────────────────────────────────────────────────────────────────────────

async function runDailyNotifications() {
  console.log(`\n[daily] ⏰ Starting daily notification job — ${new Date().toISOString()}`);

  try {
    // Only process users who have at least one enabled FCM token
    const users = await User.find(
      { fcmTokens: { $elemMatch: { enabled: true } } },
      { _id: 1, email: 1, name: 1, fcmTokens: 1 }
    ).lean();

    console.log(`[daily] Found ${users.length} users with enabled push tokens`);

    // Process one at a time to avoid hammering MongoDB / FCM
    for (const user of users) {
      await runForUser(user);
    }

    console.log(`[daily] ✅ Job complete — ${new Date().toISOString()}\n`);
  } catch (err) {
    console.error('[daily] ❌ Fatal job error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule — 08:00 and 18:00 every day (server local time)
// ─────────────────────────────────────────────────────────────────────────────

function startDailyNotificationScheduler() {
  // "0 8 * * *"  = every day at 08:00
  // "0 18 * * *" = every day at 18:00
  cron.schedule('0 8 * * *', () => {
    runDailyNotifications().catch(err =>
      console.error('[daily] Unhandled error in 08:00 run:', err)
    );
  });

  cron.schedule('0 18 * * *', () => {
    runDailyNotifications().catch(err =>
      console.error('[daily] Unhandled error in 18:00 run:', err)
    );
  });

  console.log('✅ Daily notification scheduler started (08:00 & 18:00)');
}

module.exports = { startDailyNotificationScheduler, runDailyNotifications };
