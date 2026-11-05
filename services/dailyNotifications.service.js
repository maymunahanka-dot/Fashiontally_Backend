/**
 * services/dailyNotifications.service.js
 *
 * Daily push summaries for each account (owner and team members' devices):
 *   08:00  low stock · today's appointments · orders due today · orders and
 *          invoices that became overdue yesterday · pending-orders summary
 *   18:00  tomorrow's appointments · orders due tomorrow
 *
 * "Overdue" is only sent the day after the due date, so it isn't repeated daily.
 * All dates are Lagos time (UTC+1, no daylight saving).
 */

const cron        = require('node-cron');
const User        = require('../models/User');
const Inventory   = require('../models/Inventory');
const Appointment = require('../models/Appointment');
const Order       = require('../models/Order');
const Invoice     = require('../models/Invoice');
const { sendNotification } = require('./notification.service');

const TIMEZONE = 'Africa/Lagos';
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const COMPLETE_ORDER_STATUSES = ['completed', 'delivered', 'cancelled', 'canceled'];
const SETTLED_INVOICE_STATUSES = ['paid', 'cancelled', 'canceled'];
const UPCOMING_APPOINTMENT_STATUSES = ['Scheduled', 'scheduled', 'Confirmed', 'confirmed'];

/** YYYY-MM-DD in Lagos time for an instant. */
const lagosDate = (date) => new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

/** Lagos calendar dates for yesterday, today and tomorrow. */
function getDays(now = new Date()) {
  return {
    yesterday: lagosDate(new Date(now.getTime() - DAY_MS)),
    today:     lagosDate(now),
    tomorrow:  lagosDate(new Date(now.getTime() + DAY_MS)),
  };
}

/**
 * Calendar date (YYYY-MM-DD, Lagos) from a stored date string.
 * Handles "2026-07-06", full ISO timestamps (mobile app), "07/06/2026", etc.
 */
function extractDatePart(str) {
  if (!str) return '';
  const value = String(str);
  // Date only — already a calendar date
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Full timestamp — convert the instant to the Lagos date
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    return isNaN(d) ? value.slice(0, 10) : lagosDate(d);
  }
  // MM/DD/YYYY
  const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const d = new Date(value);
  return isNaN(d) ? '' : lagosDate(d);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listNames = (items, field = 'clientName') => {
  const names = items.map((i) => i[field]).filter(Boolean);
  const shown = names.slice(0, 2).join(' & ');
  return names.length > 2 ? `${shown} +${names.length - 2} more` : shown;
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-account job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} user
 * @param {'morning'|'evening'} slot
 */
async function runForUser(user, slot, now = new Date()) {
  const email  = user.email;
  const userId = String(user._id);
  const push = (title, body, data) => sendNotification(userId, title, body, data);

  try {
    const { yesterday, today, tomorrow } = getDays(now);
    const day = slot === 'morning' ? today : tomorrow;
    const dayWord = slot === 'morning' ? 'today' : 'tomorrow';

    // ── Low-stock inventory (morning) ───────────────────────────────────────
    if (slot === 'morning') {
      const allInventory = await Inventory.find({ userEmail: email }).lean();
      const lowStock = allInventory.filter(item => {
        const qty     = item.quantity     ?? 0;
        const reorder = item.reorderPoint ?? 0;
        // If reorderPoint is set (> 0) use it, otherwise flag anything <= 3
        return reorder > 0 ? qty <= reorder : qty <= 3;
      });

      if (lowStock.length > 0) {
        const names = lowStock.slice(0, 3).map(i => i.name).join(', ');
        const more  = lowStock.length > 3 ? ` +${lowStock.length - 3} more` : '';
        const body  = lowStock.length === 1
          ? `"${lowStock[0].name}" is running low (${lowStock[0].quantity} ${lowStock[0].unit || 'left'}).`
          : `${lowStock.length} inventory items are low: ${names}${more}.`;
        await push('🔴 Low Stock Alert', body, { type: 'low_stock' });
        console.log(`[daily] ✅ Low-stock sent to ${email} (${lowStock.length} items)`);
      }
    }

    // ── Appointments today (morning) / tomorrow (evening) ──────────────────
    const appts = (await Appointment.find({
      userEmail: email,
      status:    { $in: UPCOMING_APPOINTMENT_STATUSES },
    }).lean()).filter(a => extractDatePart(a.date) === day);

    if (appts.length > 0) {
      const names = listNames(appts);
      const body = appts.length === 1
        ? `Appointment ${dayWord}${names ? ` with ${names}` : ''}${appts[0].time ? ` at ${appts[0].time}` : ''}.`
        : `${plural(appts.length, 'appointment')} ${dayWord}${names ? ` — ${names}` : ''}.`;
      await push('📅 Upcoming Appointments', body, { type: 'appointments' });
      console.log(`[daily] ✅ Appointments (${dayWord}) sent to ${email} (${appts.length})`);
    }

    // ── Orders ──────────────────────────────────────────────────────────────
    const openOrders = await Order.find({
      userEmail: email,
      status:    { $nin: COMPLETE_ORDER_STATUSES },
    }).lean();

    const dueOrders = openOrders.filter(o => extractDatePart(o.dueDate) === day);
    if (dueOrders.length > 0) {
      const names = listNames(dueOrders);
      const body = dueOrders.length === 1
        ? `${names ? `${names}'s order` : 'An order'} is due ${dayWord}.`
        : `${plural(dueOrders.length, 'order')} due ${dayWord}${names ? ` — ${names}` : ''}.`;
      await push(`📦 Order${dueOrders.length === 1 ? '' : 's'} due ${dayWord}`, body,
        { type: 'order_due', ...(dueOrders.length === 1 && { orderId: dueOrders[0].id }) });
      console.log(`[daily] ✅ Orders due ${dayWord} sent to ${email} (${dueOrders.length})`);
    }

    if (slot === 'morning') {
      const newlyOverdue = openOrders.filter(o => extractDatePart(o.dueDate) === yesterday);
      if (newlyOverdue.length > 0) {
        const names = listNames(newlyOverdue);
        const body = newlyOverdue.length === 1
          ? `${names ? `${names}'s order` : 'An order'} was due yesterday and isn't marked complete.`
          : `${plural(newlyOverdue.length, 'order')} became overdue yesterday${names ? ` — ${names}` : ''}.`;
        await push('⚠️ Order overdue', body,
          { type: 'order_overdue', ...(newlyOverdue.length === 1 && { orderId: newlyOverdue[0].id }) });
        console.log(`[daily] ✅ Overdue orders sent to ${email} (${newlyOverdue.length})`);
      }

      // ── Invoices that became overdue yesterday ────────────────────────────
      const overdueInvoices = (await Invoice.find({ userEmail: email }).lean()).filter(inv =>
        extractDatePart(inv.dueDate) === yesterday &&
        !SETTLED_INVOICE_STATUSES.includes(String(inv.status || '').toLowerCase())
      );
      if (overdueInvoices.length > 0) {
        const names = listNames(overdueInvoices);
        const body = overdueInvoices.length === 1
          ? `The invoice${names ? ` for ${names}` : ''} was due yesterday and is still unpaid.`
          : `${plural(overdueInvoices.length, 'invoice')} became overdue yesterday${names ? ` — ${names}` : ''}.`;
        await push('🧾 Invoice overdue', body,
          { type: 'invoice_overdue', ...(overdueInvoices.length === 1 && { invoiceId: overdueInvoices[0].id }) });
        console.log(`[daily] ✅ Overdue invoices sent to ${email} (${overdueInvoices.length})`);
      }

      // ── Pending-orders summary ────────────────────────────────────────────
      if (openOrders.length > 0) {
        const body = openOrders.length === 1
          ? `You have 1 order still in progress for ${openOrders[0].clientName || 'a client'}.`
          : `You have ${openOrders.length} orders that are not yet completed.`;
        await push('📦 Pending Orders', body, { type: 'pending_orders' });
        console.log(`[daily] ✅ Pending-orders alert sent to ${email} (${openOrders.length} orders)`);
      }
    }
  } catch (err) {
    console.error(`[daily] ❌ Error processing user ${email}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main job — fetches all users with tokens, runs for each
// ─────────────────────────────────────────────────────────────────────────────

/** @param {'morning'|'evening'} slot */
async function runDailyNotifications(slot = 'morning', now = new Date()) {
  console.log(`\n[daily] ⏰ Starting ${slot} notification job — ${now.toISOString()}`);

  try {
    // Only process users who have at least one enabled FCM token
    const users = await User.find(
      { fcmTokens: { $elemMatch: { enabled: true } } },
      { _id: 1, email: 1, name: 1, fcmTokens: 1 }
    ).lean();

    console.log(`[daily] Found ${users.length} users with enabled push tokens`);

    // Process one at a time to avoid hammering MongoDB / FCM
    for (const user of users) {
      await runForUser(user, slot, now);
    }

    console.log(`[daily] ✅ ${slot} job complete — ${new Date().toISOString()}\n`);
  } catch (err) {
    console.error('[daily] ❌ Fatal job error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule — 08:00 and 18:00 every day, Lagos time
// ─────────────────────────────────────────────────────────────────────────────

function startDailyNotificationScheduler() {
  cron.schedule('0 8 * * *', () => {
    runDailyNotifications('morning').catch(err =>
      console.error('[daily] Unhandled error in 08:00 run:', err)
    );
  }, { timezone: TIMEZONE });

  cron.schedule('0 18 * * *', () => {
    runDailyNotifications('evening').catch(err =>
      console.error('[daily] Unhandled error in 18:00 run:', err)
    );
  }, { timezone: TIMEZONE });

  console.log('✅ Daily notification scheduler started (08:00 & 18:00 Lagos time)');
}

module.exports = { startDailyNotificationScheduler, runDailyNotifications, runForUser, extractDatePart, getDays, lagosDate };
