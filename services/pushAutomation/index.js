/**
 * services/pushAutomation
 *
 * Automated push notifications: the short form of each automated email (services/emailAutomation),
 * sent on the same journey (A welcome · C free to paid · D new subscriber · E renewal ·
 * F inactive · G existing sign-ups) but with their own switches, texts and log, so emails and
 * notifications can be turned on, edited and followed separately in the admin panel.
 *
 * Each notification
 *   - goes to the account owner's phones (push), and
 *   - is saved to their notification page (web panel and the app's notifications screen),
 *     so it is seen even without a phone or with push turned off.
 *
 * How it works
 *   - Every 15 minutes between 09:00 and 19:00 Lagos time (a few minutes after the emails),
 *     it uses the email planner to work out what is due from each user's live data.
 *     A notification whose reason no longer holds is logged as skipped; each goes to a user once.
 *   - Limits: at most 1 automated notification per user per day, at least 2 days between the
 *     tips (A, C, F, G), PUSH_AUTOMATION_DAILY_LIMIT in total a day (default 2000) and at most
 *     200 of sequence G a day. Most important first: E, D, A, C, F, G.
 *   - Everything starts off (main switch + one per sequence in the admin panel).
 *   - Off on a local backend (NODE_ENV=development) so a copy pointed at the live database never
 *     notifies customers; override with PUSH_AUTOMATION_ENABLED=true|false.
 */
const cron = require('node-cron');
const User = require('../../models/User');
const UserNotification = require('../../models/UserNotification');
const { PushAutomationSetting, PushAutomationTemplate, PushAutomationLog } = require('../../models/PushAutomation');
const email = require('../emailAutomation');
const { deliverPush, devicesFor } = require('../notification.service');
const { lagosDay } = require('../adminEmailQueue.service');
const { TEMPLATES: PUSH_TEMPLATES, OPEN } = require('./templates');

const TIMEZONE = 'Africa/Lagos';
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 19;
const G_DAILY_LIMIT = 200;
const PRIORITY = ['E', 'D', 'A', 'C', 'F', 'G'];
const INBOX_TYPE = 'tip'; // shown as an announcement on the web and in the app
const TITLE_MAX = 80;
const BODY_MAX = 240;

const dailyLimit = () => {
  const n = parseInt(process.env.PUSH_AUTOMATION_DAILY_LIMIT, 10);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
};

const sendingEnabled = () => {
  const flag = process.env.PUSH_AUTOMATION_ENABLED;
  return flag ? flag === 'true' : process.env.NODE_ENV !== 'development';
};

// ── Settings and templates ──────────────────────────────────────────────────

const getSettings = async () => {
  const found = await PushAutomationSetting.findOne({ id: 'main' }).lean();
  if (found) return found;
  try {
    await PushAutomationSetting.create({ id: 'main' });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return PushAutomationSetting.findOne({ id: 'main' }).lean();
};

/** Name, timing and sequence come from the matching email, the text from the push defaults + admin edits */
const loadTemplates = async () => {
  const overrides = await PushAutomationTemplate.find({}).lean();
  const byKey = {};
  for (const o of overrides) byKey[`${o.key}:${o.lang}`] = o;
  const result = {};
  for (const [key, def] of Object.entries(PUSH_TEMPLATES)) {
    const mail = email.TEMPLATES[key];
    if (!mail) continue;
    result[key] = { key, seq: mail.seq, name: mail.name, when: mail.when, open: def.open };
    for (const lang of ['en', 'fr']) {
      const o = byKey[`${key}:${lang}`];
      result[key][lang] = {
        title: o?.title || def[lang].title,
        body: o?.body || def[lang].body,
        edited: Boolean(o),
        editedAt: o?.updatedAt || null,
      };
    }
  }
  return result;
};

// ── Rendering ───────────────────────────────────────────────────────────────

const clip = (s, max) => {
  const v = String(s || '').replace(/\s+/g, ' ').trim();
  return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
};

/** Same values as the emails, plus offer_short */
const buildVars = (templateKey, lang, ctx, emailSettings) => {
  const vars = email.buildVars(templateKey, lang, ctx, emailSettings);
  const fr = lang === 'fr';
  vars.offer_short = email.offerActive(emailSettings)
    ? fr
      ? `${vars.offer_text}, jusqu'au ${vars.offer_end_date}.`
      : `${vars.offer_text}, until ${vars.offer_end_date}.`
    : fr
      ? 'Forfaits dès ₦5 000 par mois.'
      : 'Plans start at ₦5,000 a month.';
  return vars;
};

/** @returns {{ title, body, url, pushType }} */
const renderPush = ({ templateKey, lang, ctx, emailSettings, templates, draft }) => {
  const def = templates[templateKey];
  const tpl = { ...(def[lang] || def.en), ...(draft || {}) };
  const vars = buildVars(templateKey, lang, ctx, emailSettings);
  const open = OPEN[def.open] || OPEN.app;
  return {
    title: clip(email.fill(tpl.title, vars, false), TITLE_MAX),
    body: clip(email.fill(tpl.body, vars, false), BODY_MAX),
    url: open.web,
    pushType: open.push,
  };
};

// ── Sending one ─────────────────────────────────────────────────────────────

/**
 * Saves it to the person's notification page and pushes it to the owner's phones.
 * @returns {Promise<{ devices: number }>} phones it reached
 */
const deliver = async (user, msg, { key, inbox = true } = {}) => {
  if (inbox) {
    await UserNotification.create({ email: user.email, type: INBOX_TYPE, title: msg.title, body: msg.body, url: msg.url });
  }
  const devices = devicesFor(user, 'owner');
  if (!devices.length) return { devices: 0 };
  const data = { type: msg.pushType || INBOX_TYPE, url: msg.url, source: 'automation', ...(key ? { key } : {}) };
  const result = await deliverPush(devices, msg.title, msg.body, data);
  if (result.invalidTokens.length) {
    await User.updateOne({ _id: user._id }, { $pull: { fcmTokens: { token: { $in: result.invalidTokens } } } });
  }
  return { devices: result.delivered };
};

// ── The run ─────────────────────────────────────────────────────────────────

let running = false;

/**
 * Works out and sends what's due now. `dryRun` returns the plan without sending or logging.
 */
const runPushAutomation = async ({ dryRun = false, now = Date.now(), ignoreWindow = false } = {}) => {
  const summary = { sent: 0, skipped: 0, failed: 0, deferred: 0, considered: 0, reason: '', plan: [] };
  const settings = await getSettings();
  if (!settings.enabled) return { ...summary, reason: 'Automated notifications are switched off' };
  if (!dryRun && !sendingEnabled()) return { ...summary, reason: 'Sending is off on this server (local development)' };
  const hour = email.lagosHour(new Date(now));
  if (!ignoreWindow && (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR)) return { ...summary, reason: 'Outside 09:00–19:00 Lagos time' };
  if (running && !dryRun) return { ...summary, reason: 'Already running' };
  if (!dryRun) running = true;

  try {
    const emailSettings = await email.getSettings();
    // The email planner, with this channel's G start date (offer text is shared with the emails)
    const planSettings = { ...emailSettings, gStartedAt: settings.gStartedAt, sequences: settings.sequences };
    const enabledSeq = (seq) => Boolean(settings.sequences?.[seq]);

    const users = await email.loadCandidates(planSettings, now);
    const data = await email.loadData(users);
    const emails = users.map((u) => String(u.email).toLowerCase());
    const allLogs = emails.length ? await PushAutomationLog.find({ email: { $in: emails } }).lean() : [];
    const logsByEmail = new Map();
    allLogs.forEach((l) => {
      if (!logsByEmail.has(l.email)) logsByEmail.set(l.email, []);
      logsByEmail.get(l.email).push(l);
    });
    const today = lagosDay(new Date(now));
    const templates = await loadTemplates();
    const isTip = (seq) => Boolean(email.SEQUENCES[seq]?.marketing);

    const toSend = [];
    for (const u of users) {
      const addr = String(u.email).toLowerCase();
      const logs = logsByEmail.get(addr) || [];
      const done = new Set(logs.map((l) => l.key));
      const { items, ctx } = email.planForUser(u, data, planSettings, logs, now);
      const due = items.filter((it) => templates[it.template] && enabledSeq(it.seq) && !done.has(it.key) && it.due <= now && now <= it.expires);
      if (!due.length) continue;
      summary.considered += 1;
      const lang = u.language === 'fr' ? 'fr' : 'en';

      const sendable = [];
      for (const it of due) {
        if (it.skip) {
          summary.skipped += 1;
          summary.plan.push({ email: addr, key: it.key, template: it.template, action: 'skip', reason: it.skip });
          if (!dryRun) {
            await PushAutomationLog.create({ email: addr, key: it.key, template: it.template, seq: it.seq, status: 'skipped', reason: it.skip, lang, day: today }).catch((e) => {
              if (e.code !== 11000) throw e;
            });
          }
        } else sendable.push(it);
      }
      if (!sendable.length) continue;

      // Per-user limits: one a day, 2 days between tips
      const sentLogs = logs.filter((l) => l.status === 'sent' || l.status === 'sending');
      if (sentLogs.some((l) => l.day === today)) {
        summary.deferred += sendable.length;
        continue;
      }
      const lastTip = sentLogs.filter((l) => isTip(l.seq)).reduce((max, l) => Math.max(max, new Date(l.at).getTime()), 0);
      const allowed = sendable.filter((it) => !isTip(it.seq) || !lastTip || email.dayGap(lastTip, now) >= 2);
      summary.deferred += sendable.length - allowed.length;
      if (!allowed.length) continue;

      allowed.sort((a, b) => PRIORITY.indexOf(a.seq) - PRIORITY.indexOf(b.seq) || a.due - b.due);
      const pick = allowed[0];
      summary.deferred += allowed.length - 1;
      toSend.push({ it: pick, ctx: { ...ctx, limitType: pick.limitType, limitUsed: pick.limitUsed }, addr, lang, userId: u._id });
    }

    toSend.sort((a, b) => PRIORITY.indexOf(a.it.seq) - PRIORITY.indexOf(b.it.seq) || a.it.due - b.it.due);
    const [sentToday, gToday] = dryRun
      ? [0, 0]
      : await Promise.all([
          PushAutomationLog.countDocuments({ day: today, status: { $in: ['sent', 'sending'] } }),
          PushAutomationLog.countDocuments({ seq: 'G', day: today, status: { $in: ['sent', 'sending'] } }),
        ]);
    let left = dailyLimit() - sentToday;
    let gSentToday = gToday;
    let failsInARow = 0;

    for (const job of toSend) {
      const { it, ctx, addr, lang } = job;
      if (it.seq === 'G' && gSentToday >= G_DAILY_LIMIT) {
        summary.deferred += 1;
        continue;
      }
      if (dryRun) {
        const msg = renderPush({ templateKey: it.template, lang, ctx, emailSettings, templates });
        summary.plan.push({ email: addr, key: it.key, template: it.template, action: 'send', lang, title: msg.title });
        summary.sent += 1;
        continue;
      }
      if (left <= 0) {
        summary.deferred += 1;
        summary.reason = "Today's limit for automated notifications is reached";
        continue;
      }
      // Claim the (user, notification) pair first so two servers can never both send it
      try {
        await PushAutomationLog.create({ email: addr, key: it.key, template: it.template, seq: it.seq, status: 'sending', lang, day: today });
      } catch (error) {
        if (error.code === 11000) continue;
        throw error;
      }
      left -= 1;
      try {
        const user = await User.findById(job.userId).select('email fcmTokens').lean();
        if (!user) throw new Error('Account not found');
        const msg = renderPush({ templateKey: it.template, lang, ctx, emailSettings, templates });
        const { devices } = await deliver(user, msg, { key: it.template });
        await PushAutomationLog.updateOne({ email: addr, key: it.key }, { $set: { status: 'sent', devices, at: new Date() } });
        summary.sent += 1;
        summary.plan.push({ email: addr, key: it.key, template: it.template, action: 'sent', lang, devices });
        if (it.seq === 'G') gSentToday += 1;
        failsInARow = 0;
      } catch (error) {
        summary.failed += 1;
        await PushAutomationLog.updateOne({ email: addr, key: it.key }, { $set: { status: 'failed', reason: String(error.message).slice(0, 300) } });
        console.error(`[push-automation] ${it.template} to ${addr} failed:`, error.message);
        failsInARow += 1;
        if (failsInARow >= 5) {
          summary.reason = 'Stopped after 5 failures in a row';
          break;
        }
      }
    }
    return summary;
  } finally {
    if (!dryRun) running = false;
  }
};

const startPushAutomationScheduler = () => {
  // 5 minutes after the email run, so the two don't load the same data at once
  cron.schedule(
    '5-59/15 * * * *',
    () => {
      runPushAutomation()
        .then((s) => {
          if (s.sent || s.failed || s.skipped) {
            console.log(`[push-automation] sent ${s.sent}, skipped ${s.skipped}, failed ${s.failed}, waiting ${s.deferred}${s.reason ? ` (${s.reason})` : ''}`);
          }
        })
        .catch((error) => console.error('[push-automation] run failed:', error.message));
    },
    { timezone: TIMEZONE }
  );
  console.log(`[push-automation] scheduler started (sending ${sendingEnabled() ? 'on' : 'off on this server'})`);
};

// ── Admin helpers ───────────────────────────────────────────────────────────

/** One notification with sample data (and unsaved edits), for the admin panel */
const previewPush = async ({ key, lang = 'en', draft }) => {
  const [emailSettings, templates] = await Promise.all([email.getSettings(), loadTemplates()]);
  if (!templates[key]) throw new Error('Unknown notification');
  return renderPush({ templateKey: key, lang, ctx: email.sampleContext(key), emailSettings, templates, draft });
};

/**
 * Sends the sample version to one account (an admin testing on their own phone).
 * @param {boolean} inbox also put it on that account's notification page
 */
const sendTestPush = async ({ to, key, lang = 'en', draft, inbox = false }) => {
  const escaped = String(to).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const user = await User.findOne({ email: new RegExp(`^${escaped}$`, 'i') }).select('email fcmTokens').lean();
  if (!user) throw new Error('No FashionTally account uses this email');
  const msg = await previewPush({ key, lang, draft });
  const test = { ...msg, title: `[Test] ${msg.title}` };
  const { devices } = await deliver(user, test, { inbox });
  return { devices, phones: devicesFor(user, 'owner').length, msg: test };
};

const todayStatus = async () => {
  const day = lagosDay();
  const sentToday = await PushAutomationLog.countDocuments({ day, status: { $in: ['sent', 'sending'] } });
  const limit = dailyLimit();
  return { limit, sentToday, leftToday: Math.max(0, limit - sentToday), day };
};

module.exports = {
  runPushAutomation,
  startPushAutomationScheduler,
  previewPush,
  sendTestPush,
  loadTemplates,
  getSettings,
  todayStatus,
  sendingEnabled,
  renderPush,
  TEMPLATES: PUSH_TEMPLATES,
  SEQUENCES: email.SEQUENCES,
  PRIORITY,
  TITLE_MAX,
  BODY_MAX,
};
