/**
 * Admin panel: automated emails (/api/admin/email-automation)
 * Switches, email texts (English and French), previews, test sends and the send log.
 */
const { EmailAutomationSetting, EmailAutomationTemplate, EmailAutomationLog } = require('../models/EmailAutomation');
const auto = require('../services/emailAutomation');
const { sendBrevoEmail } = require('../config/brevo');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEQ_KEYS = Object.keys(auto.SEQUENCES);
const adminName = (req) => req.admin?.label || 'admin';

const fail = (res, error, status = 500) => res.status(status).json({ success: false, error: error.message || String(error) });

// GET /  — everything the page needs
const getOverview = async (req, res) => {
  try {
    const [settings, templates, quota, counts] = await Promise.all([
      auto.getSettings(),
      auto.loadTemplates(),
      auto.quotaStatus(),
      EmailAutomationLog.aggregate([{ $group: { _id: { t: '$template', s: '$status' }, n: { $sum: 1 } } }]),
    ]);
    const stats = {};
    counts.forEach((c) => {
      stats[c._id.t] = stats[c._id.t] || { sent: 0, skipped: 0, failed: 0 };
      if (c._id.s in stats[c._id.t]) stats[c._id.t][c._id.s] = c.n;
    });
    const emails = Object.entries(templates).map(([key, t]) => ({
      key,
      seq: t.seq,
      name: t.name,
      when: t.when,
      hasButton: Boolean(t.link),
      en: t.en,
      fr: t.fr,
      stats: stats[key] || { sent: 0, skipped: 0, failed: 0 },
    }));
    res.json({
      success: true,
      data: {
        settings,
        sequences: auto.SEQUENCES,
        priority: auto.PRIORITY,
        emails,
        quota,
        sendingEnabled: auto.sendingEnabled(),
      },
    });
  } catch (error) {
    fail(res, error);
  }
};

// PUT /settings  { enabled?, sequences?: {A: true...}, offer?: {textEn, textFr, endDate} }
const updateSettings = async (req, res) => {
  try {
    const current = await auto.getSettings();
    const $set = { updatedAt: new Date(), updatedBy: adminName(req) };
    if (typeof req.body.enabled === 'boolean') $set.enabled = req.body.enabled;
    if (req.body.sequences && typeof req.body.sequences === 'object') {
      for (const k of SEQ_KEYS) {
        if (typeof req.body.sequences[k] === 'boolean') $set[`sequences.${k}`] = req.body.sequences[k];
      }
      // G targets users who signed up before it was first switched on
      if (req.body.sequences.G === true && !current.gStartedAt) $set.gStartedAt = new Date();
    }
    if (req.body.offer && typeof req.body.offer === 'object') {
      const o = req.body.offer;
      $set['offer.textEn'] = String(o.textEn || '').slice(0, 300);
      $set['offer.textFr'] = String(o.textFr || '').slice(0, 300);
      const end = o.endDate ? new Date(o.endDate) : null;
      if (end && Number.isNaN(end.getTime())) return fail(res, new Error('Invalid offer end date'), 400);
      $set['offer.endDate'] = end;
    }
    const settings = await EmailAutomationSetting.findOneAndUpdate({ id: 'main' }, { $set }, { new: true, upsert: true }).lean();
    console.log(`[email-automation] settings changed by ${adminName(req)}:`, JSON.stringify(req.body));
    res.json({ success: true, data: settings });
  } catch (error) {
    fail(res, error);
  }
};

const readTemplateBody = (body) => ({
  subject: String(body.subject || '').trim().slice(0, 200),
  preview: String(body.preview || '').trim().slice(0, 250),
  body: String(body.body || '').replace(/\r\n/g, '\n').trim().slice(0, 6000),
  button: String(body.button || '').trim().slice(0, 60),
});

// PUT /templates/:key/:lang  — save edited text
const saveTemplate = async (req, res) => {
  try {
    const { key, lang } = req.params;
    if (!auto.TEMPLATES[key] || !['en', 'fr'].includes(lang)) return fail(res, new Error('Unknown email'), 404);
    const t = readTemplateBody(req.body);
    if (!t.subject || !t.body) return fail(res, new Error('Subject and text are required'), 400);
    await EmailAutomationTemplate.findOneAndUpdate(
      { key, lang },
      { $set: { ...t, updatedAt: new Date(), updatedBy: adminName(req) } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

// DELETE /templates/:key/:lang  — back to the default text
const resetTemplate = async (req, res) => {
  try {
    await EmailAutomationTemplate.deleteOne({ key: req.params.key, lang: req.params.lang });
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

// POST /preview  { key, lang, draft? }
const preview = async (req, res) => {
  try {
    const { key, lang = 'en' } = req.body || {};
    const draft = req.body?.draft ? readTemplateBody(req.body.draft) : null;
    const msg = await auto.previewEmail({ key, lang: lang === 'fr' ? 'fr' : 'en', draft: draft?.subject && draft?.body ? draft : null });
    res.json({ success: true, data: msg });
  } catch (error) {
    fail(res, error, 400);
  }
};

// POST /test  { key, lang, to, draft? }  — sends the sample version to one address
const sendTest = async (req, res) => {
  try {
    if (!auto.sendingEnabled()) {
      return fail(res, new Error('Sending is turned off on this server (local development). Send tests from the live admin panel.'), 503);
    }
    const to = String(req.body?.to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(to)) return fail(res, new Error('Enter a valid email address'), 400);
    const { key, lang = 'en' } = req.body || {};
    const draft = req.body?.draft ? readTemplateBody(req.body.draft) : null;
    const msg = await auto.previewEmail({ key, lang: lang === 'fr' ? 'fr' : 'en', draft: draft?.subject && draft?.body ? draft : null });
    if (!(await auto.claimQuota())) return fail(res, new Error("Today's allowance for automated emails is used up."), 429);
    try {
      await sendBrevoEmail({
        to,
        subject: `[Test] ${msg.subject}`,
        html: msg.html,
        text: msg.text,
        senderName: 'FashionTally',
        replyTo: process.env.AUTOMATION_REPLY_TO || process.env.BREVO_SENDER_EMAIL,
        tags: ['automation-test'],
      });
    } catch (error) {
      await auto.refundQuota();
      throw new Error(error.response?.data?.message || error.message);
    }
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

/**
 * POST /test-all  { to, lang: 'en' | 'fr' | 'both', keys?: ['A2', 'C1', ...] }
 * Sends the picked automated emails (all of them when `keys` is missing) with sample data to
 * one address, so an admin can check them in a real inbox. Each one counts against the
 * automated emails' daily allowance.
 */
const sendAllTests = async (req, res) => {
  try {
    if (!auto.sendingEnabled()) {
      return fail(res, new Error('Sending is turned off on this server (local development). Send tests from the live admin panel.'), 503);
    }
    const to = String(req.body?.to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(to)) return fail(res, new Error('Enter a valid email address'), 400);
    const langs = req.body?.lang === 'both' ? ['en', 'fr'] : [req.body?.lang === 'fr' ? 'fr' : 'en'];
    const available = Object.keys(auto.TEMPLATES).filter((k) => !k.endsWith('_offer'));
    const picked = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : null;
    const keys = picked ? available.filter((k) => picked.includes(k)) : available;
    if (!keys.length) return fail(res, new Error('Pick at least one email to send'), 400);

    const quota = await auto.quotaStatus();
    const needed = keys.length * langs.length;
    if (quota.leftToday < needed) {
      return fail(res, new Error(`This sends ${needed} emails but only ${quota.leftToday} are left in today's allowance. Try one language, or tomorrow.`), 429);
    }

    const results = [];
    for (const lang of langs) {
      for (const key of keys) {
        const item = { key, lang, name: auto.TEMPLATES[key].name };
        try {
          if (!(await auto.claimQuota())) throw new Error("Today's allowance is used up");
          const msg = await auto.previewEmail({ key, lang });
          try {
            await sendBrevoEmail({
              to,
              subject: `[Test ${key}${langs.length > 1 ? ` ${lang.toUpperCase()}` : ''}] ${msg.subject}`,
              html: msg.html,
              text: msg.text,
              senderName: 'FashionTally',
              replyTo: process.env.AUTOMATION_REPLY_TO || process.env.BREVO_SENDER_EMAIL,
              tags: ['automation-test'],
            });
          } catch (error) {
            await auto.refundQuota();
            throw new Error(error.response?.data?.message || error.message);
          }
          item.ok = true;
        } catch (error) {
          item.ok = false;
          item.error = error.message;
        }
        results.push(item);
        await new Promise((r) => setTimeout(r, 250)); // gentle on Brevo
      }
    }
    console.log(`[email-automation] ${adminName(req)} sent all test emails to ${to}: ${results.filter((r) => r.ok).length}/${results.length}`);
    res.json({ success: true, data: { to, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results } });
  } catch (error) {
    fail(res, error);
  }
};

// GET /log?template=&status=&q=&limit=  — latest sends and skips
const getLog = async (req, res) => {
  try {
    const filter = {};
    if (req.query.template) filter.template = String(req.query.template);
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.q) filter.email = { $regex: String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const rows = await EmailAutomationLog.find(filter).sort({ at: -1 }).limit(limit).lean();
    res.json({ success: true, data: rows.map(({ _id, __v, ...r }) => ({ id: String(_id), ...r })) });
  } catch (error) {
    fail(res, error);
  }
};

// GET /upcoming  — what would be sent if it ran now (nothing is sent)
const getUpcoming = async (req, res) => {
  try {
    const result = await auto.runAutomation({ dryRun: true, ignoreWindow: true });
    res.json({ success: true, data: { ...result, plan: result.plan.slice(0, 300) } });
  } catch (error) {
    fail(res, error);
  }
};

module.exports = { getOverview, updateSettings, saveTemplate, resetTemplate, preview, sendTest, sendAllTests, getLog, getUpcoming };
