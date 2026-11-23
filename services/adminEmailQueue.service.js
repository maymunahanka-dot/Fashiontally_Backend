/**
 * services/adminEmailQueue.service.js
 *
 * Sends admin email campaigns in daily batches. Brevo's free plan allows 300 emails a day for
 * everything the backend sends, split three ways: admin campaigns (ADMIN_EMAIL_DAILY_LIMIT,
 * default 100), automated emails (AUTOMATION_EMAIL_DAILY_LIMIT, default 100, see
 * services/emailAutomation) and about 100 kept free for account emails (sign-in codes,
 * receipts, resets, plan reminders).
 *
 * - The count lives in MongoDB (one row per Lagos day), so several servers share it.
 * - Each recipient is claimed atomically before sending, so two servers never email the same person.
 * - A new campaign starts sending at once with whatever is left today; the rest goes out from
 *   08:00 Lagos time on the following days (hourly runs until 23:00 pick up anything left over).
 *
 * Off when NODE_ENV=development (a local backend pointed at the live database must never email
 * customers); override with ADMIN_EMAILS_ENABLED=true|false.
 */
const cron = require('node-cron');
const EmailCampaign = require('../models/EmailCampaign');
const EmailQuota = require('../models/EmailQuota');

const TIMEZONE = 'Africa/Lagos';
const SEND_FROM_HOUR = 8; // daily batches start at 08:00 Lagos time
const STUCK_AFTER_MS = 15 * 60 * 1000;
const MAX_FAILS_IN_A_ROW = 5;

const dailyLimit = () => {
  const n = parseInt(process.env.ADMIN_EMAIL_DAILY_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
};

const sendingEnabled = () => {
  const flag = process.env.ADMIN_EMAILS_ENABLED;
  return flag ? flag === 'true' : process.env.NODE_ENV !== 'development';
};

/** Lagos calendar day as YYYY-MM-DD */
const lagosDay = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const lagosHour = (date = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(date));

/** YYYY-MM-DD plus n days */
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Lagos is UTC+1 all year (no daylight saving) */
const lagosTime = (day, hour) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+01:00`);

// ── Daily allowance ───────────────────────────────────────────────

/** Takes one email from today's allowance; false when it is used up. */
const claimQuota = async () => {
  const day = lagosDay();
  try {
    await EmailQuota.updateOne({ day }, { $setOnInsert: { sent: 0 } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error; // another server created today's row first
  }
  const row = await EmailQuota.findOneAndUpdate({ day, sent: { $lt: dailyLimit() } }, { $inc: { sent: 1 } }, { new: true });
  return Boolean(row);
};

/** Gives one back (the email was not sent). */
const refundQuota = () => EmailQuota.updateOne({ day: lagosDay(), sent: { $gt: 0 } }, { $inc: { sent: -1 } });

const quotaStatus = async () => {
  const day = lagosDay();
  const row = await EmailQuota.findOne({ day }).lean();
  const limit = dailyLimit();
  const sentToday = Math.min(row?.sent || 0, limit);
  return {
    enabled: sendingEnabled(),
    limit,
    sentToday,
    leftToday: Math.max(0, limit - sentToday),
    day,
    resetsAt: lagosTime(addDays(day, 1), 0).toISOString(),
    nextBatchAt: lagosTime(addDays(day, 1), SEND_FROM_HOUR).toISOString(),
    timezone: TIMEZONE,
  };
};

// ── Counting and planning ─────────────────────────────────────────

const countRecipients = (recipients = []) => {
  const c = { total: recipients.length, queued: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
  for (const r of recipients) c[r.status] = (c[r.status] || 0) + 1;
  c.waiting = c.queued + c.sending;
  return c;
};

/**
 * When each campaign's waiting emails go out: today's leftover allowance first, then the daily
 * limit each following day, oldest campaign first. Returns Map(campaignId → [{ day, count }]).
 */
const planBatches = (campaigns, { leftToday, limit, today }) => {
  const plan = new Map();
  let day = today;
  let left = leftToday;
  for (const c of [...campaigns].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))) {
    let waiting = c.waiting;
    const batches = [];
    while (waiting > 0) {
      if (left <= 0) {
        day = addDays(day, 1);
        left = limit;
      }
      const n = Math.min(waiting, left);
      const last = batches[batches.length - 1];
      if (last && last.day === day) last.count += n;
      else batches.push({ day, count: n });
      waiting -= n;
      left -= n;
    }
    plan.set(String(c.id), batches);
  }
  return plan;
};

// ── Sending ───────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A server that stopped mid-send leaves recipients "sending": mark them failed (they may have
 *  gone out, so they are not re-sent by themselves; the admin can retry failed ones). */
const releaseStuck = () =>
  EmailCampaign.updateMany(
    { 'recipients.status': 'sending' },
    { $set: { 'recipients.$[r].status': 'failed', 'recipients.$[r].error': 'Interrupted while sending' } },
    { arrayFilters: [{ 'r.status': 'sending', 'r.claimedAt': { $lt: new Date(Date.now() - STUCK_AFTER_MS) } }] }
  );

const finishIfDone = async (id) => {
  const open = await EmailCampaign.exists({ _id: id, 'recipients.status': { $in: ['queued', 'sending'] } });
  if (!open) await EmailCampaign.updateOne({ _id: id, status: 'sending' }, { $set: { status: 'completed', completedAt: new Date() } });
};

let running = false;

/**
 * Sends waiting emails until today's allowance runs out. `send(email, {name, subject, message,
 * campaign})` must resolve to { success, error } (defaults to the Brevo sender).
 */
const processQueue = async ({ send, delayMs = 300, force = false } = {}) => {
  if (!sendingEnabled() && !force) return { skipped: 'disabled' };
  if (running) return { skipped: 'busy' };
  running = true;
  const result = { sent: 0, failed: 0, stopped: '' };
  const sender = send || require('./emailService').sendAdminMessageEmail;
  try {
    await releaseStuck();
    const campaigns = await EmailCampaign.find({ status: 'sending' }).sort({ createdAt: 1 }).lean();
    let failsInARow = 0;

    outer: for (const c of campaigns) {
      for (const r of c.recipients) {
        if (r.status !== 'queued') continue;
        if (!(await claimQuota())) {
          result.stopped = 'daily-limit';
          break outer;
        }
        const claimed = await EmailCampaign.updateOne(
          { _id: c._id, status: 'sending', recipients: { $elemMatch: { email: r.email, status: 'queued' } } },
          { $set: { 'recipients.$.status': 'sending', 'recipients.$.claimedAt': new Date() } }
        );
        if (!claimed.modifiedCount) {
          await refundQuota(); // cancelled meanwhile, or another server took it
          continue;
        }

        let res;
        try {
          res = await sender(r.email, { name: r.name, subject: c.subject, message: c.message, campaign: true });
        } catch (error) {
          res = { success: false, error: error.message };
        }

        // Email not set up on this server: put it back and stop, nothing was sent
        if (!res?.success && /not configured/i.test(res?.error || '')) {
          await EmailCampaign.updateOne(
            { _id: c._id, 'recipients.email': r.email },
            { $set: { 'recipients.$.status': 'queued', 'recipients.$.claimedAt': null } }
          );
          await refundQuota();
          result.stopped = 'not-configured';
          break outer;
        }

        await EmailCampaign.updateOne(
          { _id: c._id, 'recipients.email': r.email },
          {
            $set: {
              'recipients.$.status': res?.success ? 'sent' : 'failed',
              'recipients.$.sentAt': new Date(),
              'recipients.$.error': res?.success ? '' : String(res?.error || 'Failed').slice(0, 200),
            },
          }
        );

        if (res?.success) {
          result.sent += 1;
          failsInARow = 0;
        } else {
          result.failed += 1;
          failsInARow += 1;
          await refundQuota();
          // Many failures in a row means Brevo itself is refusing (limit hit, key problem): stop for now
          if (failsInARow >= MAX_FAILS_IN_A_ROW) {
            result.stopped = 'too-many-failures';
            await finishIfDone(c._id);
            break outer;
          }
        }
        if (delayMs) await sleep(delayMs);
      }
      await finishIfDone(c._id);
    }
  } catch (error) {
    console.error('[admin-email] queue error:', error.message);
    result.stopped = 'error';
  } finally {
    running = false;
  }
  if (result.sent || result.failed) {
    console.log(`[admin-email] sent ${result.sent}, failed ${result.failed}${result.stopped ? ` (stopped: ${result.stopped})` : ''}`);
  }
  return result;
};

/** Starts sending in the background (after a new campaign, a retry...). */
const kickQueue = () => {
  if (!sendingEnabled()) return;
  setImmediate(() => processQueue().catch((e) => console.error('[admin-email] kick:', e.message)));
};

function startAdminEmailScheduler() {
  if (!sendingEnabled()) {
    console.log('⏸️  Admin email campaigns disabled (NODE_ENV=development or ADMIN_EMAILS_ENABLED=false)');
    return;
  }
  // Each hour from 08:00 to 23:00 Lagos: send what today's allowance allows
  cron.schedule(`0 ${SEND_FROM_HOUR}-23 * * *`, () => {
    processQueue().catch((err) => console.error('[admin-email] scheduled run:', err));
  }, { timezone: TIMEZONE });
  console.log(`✅ Admin email queue started (${dailyLimit()}/day, from ${SEND_FROM_HOUR}:00 Lagos time)`);
  // Pick up anything left from before a restart, if we're inside sending hours
  if (lagosHour() >= SEND_FROM_HOUR) setTimeout(kickQueue, 30 * 1000);
}

module.exports = {
  startAdminEmailScheduler,
  processQueue,
  kickQueue,
  quotaStatus,
  claimQuota,
  refundQuota,
  planBatches,
  countRecipients,
  sendingEnabled,
  dailyLimit,
  lagosDay,
  addDays,
};
