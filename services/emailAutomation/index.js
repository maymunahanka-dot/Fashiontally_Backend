/**
 * services/emailAutomation
 *
 * Automated emails that follow each user's journey:
 *   A Welcome and activation · C Free plan to paid · D New paying subscriber
 *   E Renewal (7 days before / 7 days after; the 3-day, 1-day and "expired" reminders
 *     already come from billingReminders.service) · F Inactive users · G Existing sign-ups (once)
 *
 * How it works
 *   - Every 15 minutes between 09:00 and 19:00 Lagos time, it looks at the users who could
 *     need an email, re-checks their live data (clients, measurements, invoices, orders, team,
 *     payments) and works out which emails are due. Nothing is queued in advance.
 *   - An email whose reason no longer holds (e.g. "add your first client" when they already
 *     have one) is logged as skipped and never sent. Each email goes to a user at most once.
 *   - Limits: at most 1 automated email per user per day, at least 2 days between the
 *     marketing ones (A, C, F, G), 100 automated emails a day in total (AUTOMATION_EMAIL_DAILY_LIMIT)
 *     and at most 50 of sequence G a day. What doesn't fit waits for the next run/day,
 *     most important first: E, D, A, C, F, G.
 *   - Switches in the admin panel: a main switch and one per sequence. Everything starts off.
 *   - Off on a local backend (NODE_ENV=development) so a copy pointed at the live database
 *     never emails customers; override with AUTOMATION_EMAILS_ENABLED=true|false.
 *   - Each user gets their app language (English or French). A, C, F and G have an unsubscribe
 *     link (the same opt-out as admin campaigns); D and E are about their own plan.
 */
const crypto = require('crypto');
const cron = require('node-cron');
const User = require('../../models/User');
const AuthUser = require('../../models/AuthUser');
const Client = require('../../models/Client');
const Measurement = require('../../models/Measurement');
const Invoice = require('../../models/Invoice');
const Order = require('../../models/Order');
const SubAdmin = require('../../models/SubAdmin');
const Payment = require('../../models/Payment');
const BrandSetting = require('../../models/BrandSetting');
const EmailQuota = require('../../models/EmailQuota');
const PaymentLink = require('../../models/PaymentLink');
const { EmailAutomationSetting, EmailAutomationTemplate, EmailAutomationLog } = require('../../models/EmailAutomation');
const { sendBrevoEmail } = require('../../config/brevo');
const { brandLayout, escapeHtml, SITE_URL } = require('../emailService');
const { subscriptionSummary } = require('../subscriptionSummary');
const { PLAN_PRICES } = require('../flutterwavePayment.service');
const { lagosDay } = require('../adminEmailQueue.service');
const { TEMPLATES, SEQUENCES, SIGN_OFF, LABELS } = require('./templates');

const TIMEZONE = 'Africa/Lagos';
const DAY = 24 * 60 * 60 * 1000;
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 19;
const G_DAILY_LIMIT = 50;
const PAY_LINK_TTL_MS = 7 * DAY;
const PRIORITY = ['E', 'D', 'A', 'C', 'F', 'G'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const dailyLimit = () => {
  const n = parseInt(process.env.AUTOMATION_EMAIL_DAILY_LIMIT, 10);
  return Number.isFinite(n) && n >= 0 ? n : 100;
};

const sendingEnabled = () => {
  const flag = process.env.AUTOMATION_EMAILS_ENABLED;
  return flag ? flag === 'true' : process.env.NODE_ENV !== 'development';
};

const lagosHour = (date = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(date));

/** Whole Lagos days between two dates (0 = same day) */
const dayGap = (a, b) => Math.round((new Date(`${lagosDay(b)}T12:00:00Z`) - new Date(`${lagosDay(a)}T12:00:00Z`)) / DAY);

const toMs = (value) => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};

/** "Open FashionTally" links: FRONTEND_APP_URL when set, otherwise the website's sign-in page */
const appUrl = () => String(process.env.FRONTEND_APP_URL || `${SITE_URL()}/login`).replace(/\/+$/, '');

// ── Daily allowance (separate count from admin campaigns, same table) ──────────

const quotaDay = (day = lagosDay()) => `auto:${day}`;

const claimQuota = async () => {
  const day = quotaDay();
  try {
    await EmailQuota.updateOne({ day }, { $setOnInsert: { sent: 0 } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  const row = await EmailQuota.findOneAndUpdate({ day, sent: { $lt: dailyLimit() } }, { $inc: { sent: 1 } }, { new: true });
  return Boolean(row);
};

const refundQuota = () => EmailQuota.updateOne({ day: quotaDay(), sent: { $gt: 0 } }, { $inc: { sent: -1 } });

const quotaStatus = async () => {
  const row = await EmailQuota.findOne({ day: quotaDay() }).lean();
  const limit = dailyLimit();
  const sentToday = Math.min(row?.sent || 0, limit);
  return { limit, sentToday, leftToday: Math.max(0, limit - sentToday), day: lagosDay() };
};

// ── Settings and templates ──────────────────────────────────────────────────

const getSettings = async () => {
  const found = await EmailAutomationSetting.findOne({ id: 'main' }).lean();
  if (found) return found;
  try {
    await EmailAutomationSetting.create({ id: 'main' });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return EmailAutomationSetting.findOne({ id: 'main' }).lean();
};

const offerActive = (settings, now = Date.now()) => {
  const end = toMs(settings?.offer?.endDate);
  return Boolean(settings?.offer?.textEn?.trim()) && Number.isFinite(end) && end > now;
};

/** Default text merged with whatever an admin changed */
const loadTemplates = async () => {
  const overrides = await EmailAutomationTemplate.find({}).lean();
  const byKey = {};
  for (const o of overrides) byKey[`${o.key}:${o.lang}`] = o;
  const result = {};
  for (const [key, def] of Object.entries(TEMPLATES)) {
    result[key] = { ...def };
    for (const lang of ['en', 'fr']) {
      const o = byKey[`${key}:${lang}`];
      result[key][lang] = {
        ...def[lang],
        ...(o
          ? {
              subject: o.subject || def[lang].subject,
              preview: o.preview ?? def[lang].preview,
              body: o.body || def[lang].body,
              button: o.button ?? def[lang].button,
            }
          : {}),
        edited: Boolean(o),
        editedAt: o?.updatedAt || null,
      };
    }
  }
  return result;
};

// ── Rendering ───────────────────────────────────────────────────────────────

const fill = (str, vars, escape) =>
  String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k] == null ? '' : String(vars[k]);
    return escape ? escapeHtml(v) : v;
  });

/** Plain-text body → paragraphs for the layout ("- " lines become a checklist) */
const toParagraphs = (body) =>
  String(body)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim());
      if (lines.every((l) => l.startsWith('- '))) {
        return `<span style="display:block;line-height:2;color:#f3f3f1;">${lines
          .map((l) => `<span style="color:#2fd3c3;">&#10003;</span>&nbsp; ${l.slice(2)}`)
          .join('<br/>')}</span>`;
      }
      return lines.join('<br/>');
    });

const fmtDate = (value, lang) =>
  Number.isFinite(toMs(value))
    ? new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', timeZone: TIMEZONE }).format(new Date(value))
    : '';

const naira = (amount, lang) =>
  amount ? `₦${Number(amount).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US').replace(/ | /g, ' ')}` : '';

const unsubscribeToken = (email) =>
  crypto.createHmac('sha256', String(process.env.JWT_SECRET || 'fashiontally')).update(`unsub:${String(email).toLowerCase()}`).digest('hex').slice(0, 32);

const backendUrl = () => String(process.env.BACKEND_URL || 'https://backend.fashiontally.com').replace(/\/+$/, '');

const unsubscribeUrl = (email) =>
  `${backendUrl()}/api/email/unsubscribe?e=${encodeURIComponent(String(email).toLowerCase())}&t=${unsubscribeToken(email)}`;

/** One-time link to the pay page, already knowing who the user is (no login), valid 7 days */
const createPayLink = async (email) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await PaymentLink.create({ tokenHash, email, expiresAt: new Date(Date.now() + PAY_LINK_TTL_MS) });
  return `${SITE_URL().replace(/\/+$/, '')}/pay?t=${token}`;
};

/** Values for the {{placeholders}} of one email */
const buildVars = (templateKey, lang, ctx, settings) => {
  const fr = lang === 'fr';
  const { user = {}, sum = {}, counts = {}, businessName, limitType, limitUsed } = ctx;
  const first = String(user.name || '').trim().split(/\s+/)[0];
  const plan = sum.plan && sum.plan !== 'Free' ? sum.plan : '';
  const offerOn = offerActive(settings);
  const offerText = fr ? settings?.offer?.textFr || settings?.offer?.textEn || '' : settings?.offer?.textEn || '';
  const offerEnd = fmtDate(settings?.offer?.endDate, lang);

  let progressLine = '';
  if ((counts.orders || 0) > 0 || (counts.clients || 0) > 0) {
    progressLine = fr
      ? `Jusqu'ici, vous avez géré ${counts.orders || 0} commandes et ${counts.clients || 0} clients avec FashionTally.`
      : `So far you've managed ${counts.orders || 0} orders and ${counts.clients || 0} clients in FashionTally.`;
  }

  let offerLine = '';
  if (templateKey === 'E5' && offerOn) {
    offerLine = fr ? `Revenez avant le ${offerEnd} et profitez de : ${offerText}.` : `Come back before ${offerEnd} and get ${offerText}.`;
  } else if (templateKey === 'G3') {
    offerLine = offerOn
      ? fr
        ? `Pour nos premiers utilisateurs uniquement : ${offerText}. Cette offre se termine le ${offerEnd}.`
        : `For our early users only: ${offerText}. This offer ends on ${offerEnd}.`
      : fr
        ? 'Les forfaits commencent à ₦5 000 par mois, et toutes les fonctionnalités vous attendent.'
        : 'Plans start at ₦5,000 a month, and every feature is ready for you.';
  }

  const limitWords = { clients: fr ? 'clients' : 'clients', invoices: fr ? 'factures' : 'invoices' };

  return {
    first_name: first || (fr ? 'à vous' : 'there'),
    business_name: businessName || user.businessName || (fr ? 'votre entreprise' : 'your business'),
    trial_end_date: fmtDate(sum.endDate, lang),
    plan_name: plan || (fr ? 'votre forfait' : 'your plan'),
    plan_price: naira(PLAN_PRICES[String(plan).toUpperCase()], lang),
    renewal_date: fmtDate(sum.endDate, lang),
    clients_count: counts.clients || 0,
    invoices_count: counts.invoices || 0,
    orders_count: counts.orders || 0,
    limit_type: limitWords[limitType] || limitWords.clients,
    limit_used: limitUsed ?? 8,
    offer_text: offerText,
    offer_end_date: offerEnd,
    progress_line: progressLine,
    offer_line: offerLine,
  };
};

/**
 * Builds one email. `forSend` creates a real pay link (only when actually sending).
 * @returns {{ subject, preview, html, text }}
 */
const renderEmail = async ({ templateKey, lang, ctx, settings, templates, forSend = false }) => {
  const def = templates[templateKey];
  const tpl = def[lang] || def.en;
  const vars = buildVars(templateKey, lang, ctx, settings);
  const subject = fill(tpl.subject, vars, false).trim();
  const preview = fill(tpl.preview, vars, false).trim();
  const marketing = SEQUENCES[def.seq].marketing;
  const email = ctx.user?.email || 'preview@example.com';

  let buttonUrl = null;
  if (def.link === 'app') buttonUrl = appUrl();
  if (def.link === 'pay') buttonUrl = forSend ? await createPayLink(ctx.user.email) : `${SITE_URL().replace(/\/+$/, '')}/pay`;
  const button = tpl.button && buttonUrl ? { text: escapeHtml(fill(tpl.button, vars, false)), url: buttonUrl } : null;

  const html = brandLayout({
    lang,
    label: LABELS[def.seq]?.[lang] || LABELS[def.seq]?.en || 'FashionTally',
    heading: escapeHtml(subject),
    preheader: escapeHtml(preview),
    paragraphs: toParagraphs(fill(escapeHtml(tpl.body), vars, true)),
    button,
    signOff: SIGN_OFF[lang] || SIGN_OFF.en,
    unsubscribeUrl: marketing ? unsubscribeUrl(email) : null,
    appUrl: appUrl(),
  });

  const textParts = [fill(tpl.body, vars, false).replace(/\n{3,}/g, '\n\n').trim()];
  const colon = lang === 'fr' ? ' :' : ':';
  if (button) textParts.push(`${fill(tpl.button, vars, false)}${colon} ${buttonUrl}`);
  textParts.push(lang === 'fr' ? 'Maimuna Anka\nFondatrice, FashionTally' : 'Maimuna Anka\nFounder, FashionTally');
  if (marketing) textParts.push(`${lang === 'fr' ? 'Se désabonner' : 'Unsubscribe'}${colon} ${unsubscribeUrl(email)}`);

  return { subject, preview, html, text: textParts.join('\n\n') };
};

// ── Who needs what ──────────────────────────────────────────────────────────

const groupBy = async (Model, field, emails, extraMatch = {}, dateField = 'createdAt') => {
  if (!emails.length) return new Map();
  const rows = await Model.aggregate([
    { $match: { [field]: { $in: emails }, ...extraMatch } },
    { $group: { _id: `$${field}`, n: { $sum: 1 }, first: { $min: `$${dateField}` } } },
  ]);
  return new Map(rows.map((r) => [String(r._id).toLowerCase(), r]));
};

/** Users who could be due an email in any sequence */
const loadCandidates = async (settings, now) => {
  const iso = (ms) => new Date(ms).toISOString();
  const or = [
    { createdAt: { $gte: iso(now - 9 * DAY) } },                                   // A
    { subscriptionType: 'trial', subscriptionEndDate: { $lte: iso(now) } },          // C (incl. C7/C8)
    { subscriptionType: 'paid' },                                                    // D, E
    { lastActiveAt: { $lte: iso(now - 7 * DAY), $gte: iso(now - 22 * DAY) } },       // F
  ];
  if (settings.gStartedAt && now < new Date(settings.gStartedAt).getTime() + 30 * DAY) {
    or.push({ createdAt: { $lt: new Date(settings.gStartedAt).toISOString() } });  // G
  }
  const [users, disabled] = await Promise.all([
    User.find(
      { $or: or },
      'name email language isPhoneBasedAccount emailOptOut businessName createdAt lastActiveAt subscriptionType planType subscriptionStartDate subscriptionEndDate trialStartDate billingCycle isSubscribed payment_amount payment_date'
    ).lean(),
    AuthUser.find({ disabled: true }, 'email').lean(),
  ]);
  const disabledSet = new Set(disabled.map((a) => String(a.email).toLowerCase()));
  const seen = new Set();
  return users.filter((u) => {
    const email = String(u.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || u.isPhoneBasedAccount || disabledSet.has(email) || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
};

/** Live data for a batch of users, fetched in a few queries */
const loadData = async (users) => {
  const emails = users.map((u) => u.email);
  const [clients, measurements, invoices, orders, team, payments, brands] = await Promise.all([
    groupBy(Client, 'userEmail', emails),
    groupBy(Measurement, 'userEmail', emails),
    groupBy(Invoice, 'userEmail', emails),
    groupBy(Order, 'userEmail', emails),
    groupBy(SubAdmin, 'invitedBy', emails),
    groupBy(Payment, 'email', emails, { status: 'successful' }),
    BrandSetting.find({ userEmail: { $in: emails } }, 'userEmail businessName').lean(),
  ]);
  const brandMap = new Map(brands.map((b) => [String(b.userEmail).toLowerCase(), b.businessName]));
  const firstPaid = new Map();
  if (payments.size) {
    const rows = await Payment.aggregate([
      { $match: { email: { $in: emails }, status: 'successful' } },
      { $group: { _id: '$email', first: { $min: { $cond: [{ $gt: ['$paidAt', ''] }, '$paidAt', '$createdAt'] } } } },
    ]);
    rows.forEach((r) => firstPaid.set(String(r._id).toLowerCase(), r.first));
  }
  return { clients, measurements, invoices, orders, team, payments, brandMap, firstPaid };
};

/**
 * Every email that applies to this user right now or later, with when it's due.
 * Item: { key, template, seq, due (ms), expires (ms), skip (reason or null) }
 */
const planForUser = (u, data, settings, logs, now) => {
  const email = String(u.email).toLowerCase();
  const get = (map) => map.get(email) || { n: 0, first: null };
  const counts = {
    clients: get(data.clients).n,
    measurements: get(data.measurements).n,
    invoices: get(data.invoices).n,
    orders: get(data.orders).n,
    team: get(data.team).n,
  };
  const first = {
    client: toMs(get(data.clients).first),
    measurement: toMs(get(data.measurements).first),
    invoice: toMs(get(data.invoices).first),
  };
  const sum = subscriptionSummary(u, now);
  const paidActive = sum.isActive && sum.status === 'active';
  let firstPaid = toMs(data.firstPaid.get(email));
  if (!Number.isFinite(firstPaid) && Number(u.payment_amount) > 0) firstPaid = toMs(u.payment_date);
  const everPaid = Number.isFinite(firstPaid) || u.subscriptionType === 'paid';
  const signup = toMs(u.createdAt) || toMs(u.trialStartDate);
  const endMs = toMs(sum.endDate);
  const lastActive = toMs(u.lastActiveAt);

  const items = [];
  const add = (key, template, due, expires, skip = null) =>
    items.push({ key, template, seq: TEMPLATES[template].seq, due, expires, skip });

  // A · Activation (first week; stops once they pay)
  const inA = Number.isFinite(signup) && now - signup < 8 * DAY;
  if (inA && !paidActive) {
    const end = signup + 8 * DAY;
    add('A2', 'A2', signup + DAY, end, counts.clients ? 'Already added a client' : null);
    add('A3', 'A3', signup + 3 * DAY, end, counts.clients ? 'Already added a client' : null);
    if (counts.clients) {
      add('A4', 'A4', Math.max(signup + 2 * DAY, first.client + DAY), end, counts.measurements ? 'Already saved measurements' : null);
      add('A5', 'A5', Math.max(signup + 4 * DAY, (first.measurement || first.client) + DAY), end, counts.invoices ? 'Already created an invoice' : null);
    }
    add('A6', 'A6', signup + 5 * DAY, end, counts.orders ? 'Already created an order' : null);
    if (counts.clients && counts.measurements && counts.invoices) {
      add('A7', 'A7', Math.max(first.client, first.measurement, first.invoice), end);
    }
  }

  // C · Free plan to paid (trial ended, never paid)
  const trialEnded = !everPaid && u.subscriptionType === 'trial' && sum.status === 'trial_ended' && Number.isFinite(endMs);
  const inC = trialEnded && now - endMs < 31 * DAY;
  if (inC) {
    const offerOn = offerActive(settings, now);
    [['C1', 2], ['C2', 4], ['C3', 7], ['C4', 10], ['C5', 14], ['C6', 21]].forEach(([key, d]) => {
      const template = key === 'C5' && offerOn ? 'C5_offer' : key;
      add(key, template, endMs + d * DAY, endMs + (d + 5) * DAY);
    });
  }
  if (trialEnded) {
    for (const type of ['clients', 'invoices']) {
      const n = counts[type];
      if (n >= 10) add(`C8:${type}`, 'C8', now, now + DAY, null);
      else if (n >= 8) add(`C7:${type}`, 'C7', now, now + DAY, null);
      const it = items[items.length - 1];
      if (it && it.key.endsWith(`:${type}`)) Object.assign(it, { limitType: type, limitUsed: n });
    }
  }

  // D · New paying subscriber (first 2 weeks after the first payment)
  if (paidActive && Number.isFinite(firstPaid) && now - firstPaid < 16 * DAY) {
    add('D2', 'D2', firstPaid + 2 * DAY, firstPaid + 7 * DAY);
    add('D3', 'D3', firstPaid + 4 * DAY, firstPaid + 9 * DAY, counts.orders ? 'Already created an order' : null);
    add('D4', 'D4', firstPaid + 10 * DAY, firstPaid + 15 * DAY, counts.team ? 'Already has a team member' : null);
  }

  // E · Renewal (the 3-day / 1-day / expired reminders already exist elsewhere)
  if (Number.isFinite(endMs)) {
    const endKey = new Date(endMs).toISOString().slice(0, 10);
    if (paidActive && endMs - now <= 7 * DAY && endMs - now > 3 * DAY) {
      add(`E1:${endKey}`, 'E1', endMs - 7 * DAY, endMs - 3 * DAY);
    }
    if (everPaid && !sum.isActive && sum.status === 'expired') {
      add(`E5:${endKey}`, 'E5', endMs + 7 * DAY, endMs + 12 * DAY);
    }
  }

  // F · Inactive (not while the first-week or free-plan emails are running)
  if (Number.isFinite(lastActive) && !inA && !inC) {
    const idle = now - lastActive;
    const period = new Date(lastActive).toISOString().slice(0, 10);
    const recentF = logs.some((l) => l.seq === 'F' && l.status === 'sent' && now - new Date(l.at).getTime() < 30 * DAY);
    if (idle >= 7 * DAY && idle < 14 * DAY && !recentF) add(`F1:${period}`, 'F1', lastActive + 7 * DAY, lastActive + 14 * DAY);
    const f1ThisPeriod = logs.some((l) => l.key === `F1:${period}` && l.status === 'sent');
    if (idle >= 14 * DAY && idle < 21 * DAY && (!recentF || f1ThisPeriod)) add(`F2:${period}`, 'F2', lastActive + 14 * DAY, lastActive + 21 * DAY);
  }

  // G · Existing sign-ups, one time (users who signed up before G was switched on, not paying)
  const gStart = toMs(settings.gStartedAt);
  if (Number.isFinite(gStart) && Number.isFinite(signup) && signup < gStart && !paidActive) {
    const g1 = logs.find((l) => l.key === 'G1' && l.status === 'sent');
    add('G1', 'G1', gStart, gStart + 14 * DAY);
    if (g1) {
      const g1At = new Date(g1.at).getTime();
      add('G2', 'G2', g1At + 3 * DAY, g1At + 10 * DAY, Number.isFinite(lastActive) && lastActive > g1At ? 'Opened the app after G1' : null);
      add('G3', 'G3', g1At + 7 * DAY, g1At + 14 * DAY);
    }
  }

  return { items, ctx: { user: u, sum, counts, businessName: data.brandMap.get(email) || '' } };
};

// ── The run ─────────────────────────────────────────────────────────────────

let running = false;

/**
 * Works out and sends what's due now. `dryRun` returns the plan without sending or logging.
 * @returns {Promise<object>} summary of what happened
 */
const runAutomation = async ({ dryRun = false, now = Date.now(), ignoreWindow = false } = {}) => {
  const summary = { sent: 0, skipped: 0, failed: 0, deferred: 0, considered: 0, reason: '', plan: [] };
  const settings = await getSettings();
  if (!settings.enabled) return { ...summary, reason: 'Automated emails are switched off' };
  if (!dryRun && !sendingEnabled()) return { ...summary, reason: 'Sending is off on this server (local development)' };
  const hour = lagosHour(new Date(now));
  if (!ignoreWindow && (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR)) return { ...summary, reason: 'Outside 09:00–19:00 Lagos time' };
  if (running && !dryRun) return { ...summary, reason: 'Already running' };
  if (!dryRun) running = true;

  try {
    const enabledSeq = (seq) => Boolean(settings.sequences?.[seq]);
    const users = await loadCandidates(settings, now);
    const data = await loadData(users);
    const emails = users.map((u) => String(u.email).toLowerCase());
    const allLogs = emails.length ? await EmailAutomationLog.find({ email: { $in: emails } }).lean() : [];
    const logsByEmail = new Map();
    allLogs.forEach((l) => {
      if (!logsByEmail.has(l.email)) logsByEmail.set(l.email, []);
      logsByEmail.get(l.email).push(l);
    });
    const today = lagosDay(new Date(now));
    const templates = await loadTemplates();

    const toSend = [];
    for (const u of users) {
      const email = String(u.email).toLowerCase();
      const logs = logsByEmail.get(email) || [];
      const done = new Set(logs.map((l) => l.key));
      const { items, ctx } = planForUser(u, data, settings, logs, now);
      const due = items.filter((it) => enabledSeq(it.seq) && !done.has(it.key) && it.due <= now && now <= it.expires);
      if (!due.length) continue;
      summary.considered += 1;

      const lang = u.language === 'fr' ? 'fr' : 'en';
      const sendable = [];
      for (const it of due) {
        const reason = it.skip || (SEQUENCES[it.seq].marketing && u.emailOptOut ? 'Unsubscribed from these emails' : null);
        if (reason) {
          summary.skipped += 1;
          summary.plan.push({ email, key: it.key, template: it.template, action: 'skip', reason });
          if (!dryRun) {
            await EmailAutomationLog.create({ email, key: it.key, template: it.template, seq: it.seq, status: 'skipped', reason, lang, day: today }).catch((e) => {
              if (e.code !== 11000) throw e;
            });
          }
        } else sendable.push(it);
      }
      if (!sendable.length) continue;

      // Per-user limits: one automated email a day, 2 days between marketing ones
      const sentLogs = logs.filter((l) => l.status === 'sent' || l.status === 'sending');
      if (sentLogs.some((l) => l.day === today)) {
        summary.deferred += sendable.length;
        continue;
      }
      const lastMarketing = sentLogs
        .filter((l) => SEQUENCES[l.seq]?.marketing)
        .reduce((max, l) => Math.max(max, new Date(l.at).getTime()), 0);
      const allowed = sendable.filter((it) => !SEQUENCES[it.seq].marketing || !lastMarketing || dayGap(lastMarketing, now) >= 2);
      summary.deferred += sendable.length - allowed.length;
      if (!allowed.length) continue;

      allowed.sort((a, b) => PRIORITY.indexOf(a.seq) - PRIORITY.indexOf(b.seq) || a.due - b.due);
      const pick = allowed[0];
      summary.deferred += allowed.length - 1;
      toSend.push({ it: pick, ctx: { ...ctx, limitType: pick.limitType, limitUsed: pick.limitUsed }, email, lang });
    }

    // Most important first; the daily allowance decides how many go today
    toSend.sort((a, b) => PRIORITY.indexOf(a.it.seq) - PRIORITY.indexOf(b.it.seq) || a.it.due - b.it.due);
    let gSentToday = await EmailAutomationLog.countDocuments({ seq: 'G', day: today, status: { $in: ['sent', 'sending'] } });
    let failsInARow = 0;
    const replyTo = process.env.AUTOMATION_REPLY_TO || process.env.BREVO_SENDER_EMAIL;

    for (const job of toSend) {
      const { it, ctx, email, lang } = job;
      if (it.seq === 'G' && gSentToday >= G_DAILY_LIMIT) {
        summary.deferred += 1;
        continue;
      }
      if (dryRun) {
        summary.plan.push({ email, key: it.key, template: it.template, action: 'send', lang });
        summary.sent += 1;
        continue;
      }
      if (!(await claimQuota())) {
        summary.deferred += toSend.length - summary.sent - summary.failed;
        summary.reason = "Today's allowance for automated emails is used up";
        break;
      }
      // Claim the (user, email) pair first so two servers can never both send it
      try {
        await EmailAutomationLog.create({ email, key: it.key, template: it.template, seq: it.seq, status: 'sending', lang, day: today });
      } catch (error) {
        await refundQuota();
        if (error.code === 11000) continue;
        throw error;
      }
      try {
        const msg = await renderEmail({ templateKey: it.template, lang, ctx, settings, templates, forSend: true });
        const marketing = SEQUENCES[it.seq].marketing;
        const res = await sendBrevoEmail({
          to: ctx.user.email,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          senderName: 'Maimuna Anka, FashionTally',
          replyTo,
          tags: ['automation', `seq-${it.seq}`, it.template],
          headers: marketing
            ? { 'List-Unsubscribe': `<${unsubscribeUrl(email)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
            : undefined,
        });
        await EmailAutomationLog.updateOne(
          { email, key: it.key },
          { $set: { status: 'sent', messageId: res?.messageId || '', at: new Date() } }
        );
        summary.sent += 1;
        summary.plan.push({ email, key: it.key, template: it.template, action: 'sent', lang });
        if (it.seq === 'G') gSentToday += 1;
        failsInARow = 0;
      } catch (error) {
        await refundQuota();
        const status = error.response?.status;
        const detail = error.response?.data?.message || error.message;
        summary.failed += 1;
        if (status && status >= 400 && status < 500) {
          // Brevo refused this address/message: keep it as failed so it isn't retried every 15 minutes
          await EmailAutomationLog.updateOne({ email, key: it.key }, { $set: { status: 'failed', reason: String(detail).slice(0, 300) } });
        } else {
          // Brevo or network problem: release it so the next run tries again
          await EmailAutomationLog.deleteOne({ email, key: it.key, status: 'sending' });
        }
        console.error(`[email-automation] ${it.template} to ${email} failed:`, detail);
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

const startEmailAutomationScheduler = () => {
  cron.schedule(
    '*/15 * * * *',
    () => {
      runAutomation()
        .then((s) => {
          if (s.sent || s.failed || s.skipped) {
            console.log(`[email-automation] sent ${s.sent}, skipped ${s.skipped}, failed ${s.failed}, waiting ${s.deferred}${s.reason ? ` (${s.reason})` : ''}`);
          }
        })
        .catch((error) => console.error('[email-automation] run failed:', error.message));
    },
    { timezone: TIMEZONE }
  );
  console.log(`[email-automation] scheduler started (sending ${sendingEnabled() ? 'on' : 'off on this server'})`);
};

// ── Admin helpers: preview and test ────────────────────────────────────────

/** A made-up user for previews */
const sampleContext = (templateKey) => {
  const now = Date.now();
  return {
    user: { name: 'Adaeze Okafor', email: 'preview@example.com', businessName: 'Adaeze Couture' },
    sum: { plan: 'Growth', endDate: new Date(now + 7 * DAY).toISOString() },
    counts: { clients: 12, invoices: 9, orders: 18 },
    businessName: 'Adaeze Couture',
    limitType: 'clients',
    limitUsed: templateKey === 'C8' ? 10 : 8,
  };
};

/** Renders an email for the admin panel, optionally with unsaved edits applied */
const previewEmail = async ({ key, lang = 'en', draft }) => {
  if (!TEMPLATES[key]) throw new Error('Unknown email');
  const [settings, templates] = await Promise.all([getSettings(), loadTemplates()]);
  if (draft) templates[key][lang] = { ...templates[key][lang], ...draft };
  return renderEmail({ templateKey: key, lang, ctx: sampleContext(key), settings, templates });
};

module.exports = {
  runAutomation,
  startEmailAutomationScheduler,
  previewEmail,
  loadTemplates,
  getSettings,
  quotaStatus,
  sendingEnabled,
  claimQuota,
  refundQuota,
  unsubscribeToken,
  TEMPLATES,
  SEQUENCES,
  PRIORITY,
  // for tests
  planForUser,
  toParagraphs,
};
