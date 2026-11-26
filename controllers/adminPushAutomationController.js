/**
 * Admin panel: automated push notifications (/api/admin/push-automation)
 * Switches, notification texts (English and French), previews, test sends and the log.
 */
const { PushAutomationSetting, PushAutomationTemplate, PushAutomationLog } = require('../models/PushAutomation');
const push = require('../services/pushAutomation');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEQ_KEYS = Object.keys(push.SEQUENCES);
const adminName = (req) => req.admin?.label || 'admin';
const fail = (res, error, status = 500) => res.status(status).json({ success: false, error: error.message || String(error) });

// GET /  — everything the page needs
const getOverview = async (req, res) => {
  try {
    const [settings, templates, today, counts, devices] = await Promise.all([
      push.getSettings(),
      push.loadTemplates(),
      push.todayStatus(),
      PushAutomationLog.aggregate([{ $group: { _id: { t: '$template', s: '$status' }, n: { $sum: 1 } } }]),
      PushAutomationLog.aggregate([{ $match: { status: 'sent' } }, { $group: { _id: '$template', phones: { $sum: { $cond: [{ $gt: ['$devices', 0] }, 1, 0] } } } }]),
    ]);
    const stats = {};
    counts.forEach((c) => {
      stats[c._id.t] = stats[c._id.t] || { sent: 0, skipped: 0, failed: 0, onPhone: 0 };
      if (c._id.s in stats[c._id.t]) stats[c._id.t][c._id.s] = c.n;
    });
    devices.forEach((d) => {
      if (stats[d._id]) stats[d._id].onPhone = d.phones;
    });
    const notifications = Object.values(templates).map((t) => ({
      key: t.key,
      seq: t.seq,
      name: t.name,
      when: t.when,
      open: t.open,
      en: t.en,
      fr: t.fr,
      stats: stats[t.key] || { sent: 0, skipped: 0, failed: 0, onPhone: 0 },
    }));
    res.json({
      success: true,
      data: {
        settings,
        sequences: push.SEQUENCES,
        priority: push.PRIORITY,
        notifications,
        today,
        limits: { title: push.TITLE_MAX, body: push.BODY_MAX },
        sendingEnabled: push.sendingEnabled(),
      },
    });
  } catch (error) {
    fail(res, error);
  }
};

// PUT /settings  { enabled?, sequences?: {A: true...} }
const updateSettings = async (req, res) => {
  try {
    const current = await push.getSettings();
    const $set = { updatedAt: new Date(), updatedBy: adminName(req) };
    if (typeof req.body.enabled === 'boolean') $set.enabled = req.body.enabled;
    if (req.body.sequences && typeof req.body.sequences === 'object') {
      for (const k of SEQ_KEYS) {
        if (typeof req.body.sequences[k] === 'boolean') $set[`sequences.${k}`] = req.body.sequences[k];
      }
      if (req.body.sequences.G === true && !current.gStartedAt) $set.gStartedAt = new Date();
    }
    const settings = await PushAutomationSetting.findOneAndUpdate({ id: 'main' }, { $set }, { new: true, upsert: true }).lean();
    console.log(`[push-automation] settings changed by ${adminName(req)}:`, JSON.stringify(req.body));
    res.json({ success: true, data: settings });
  } catch (error) {
    fail(res, error);
  }
};

const readDraft = (body = {}) => ({
  title: String(body.title || '').replace(/\s+/g, ' ').trim().slice(0, push.TITLE_MAX),
  body: String(body.body || '').replace(/\s+/g, ' ').trim().slice(0, push.BODY_MAX),
});

// PUT /templates/:key/:lang
const saveTemplate = async (req, res) => {
  try {
    const { key, lang } = req.params;
    if (!push.TEMPLATES[key] || !['en', 'fr'].includes(lang)) return fail(res, new Error('Unknown notification'), 404);
    const t = readDraft(req.body);
    if (!t.title || !t.body) return fail(res, new Error('Title and text are required'), 400);
    await PushAutomationTemplate.findOneAndUpdate({ key, lang }, { $set: { ...t, updatedAt: new Date(), updatedBy: adminName(req) } }, { upsert: true });
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

// DELETE /templates/:key/:lang  — back to the default text
const resetTemplate = async (req, res) => {
  try {
    await PushAutomationTemplate.deleteOne({ key: req.params.key, lang: req.params.lang });
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

// POST /preview  { key, lang, draft? }
const preview = async (req, res) => {
  try {
    const { key, lang = 'en' } = req.body || {};
    const draft = req.body?.draft ? readDraft(req.body.draft) : null;
    const msg = await push.previewPush({ key, lang: lang === 'fr' ? 'fr' : 'en', draft: draft?.title && draft?.body ? draft : null });
    res.json({ success: true, data: msg });
  } catch (error) {
    fail(res, error, 400);
  }
};

// POST /test  { key, lang, to, draft?, inbox? }  — sample version to one account's phones
const sendTest = async (req, res) => {
  try {
    if (!push.sendingEnabled()) {
      return fail(res, new Error('Sending is turned off on this server (local development). Send tests from the live admin panel.'), 503);
    }
    const to = String(req.body?.to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(to)) return fail(res, new Error("Enter the email of a FashionTally account (yours)"), 400);
    const { key, lang = 'en' } = req.body || {};
    if (!push.TEMPLATES[key]) return fail(res, new Error('Unknown notification'), 404);
    const draft = req.body?.draft ? readDraft(req.body.draft) : null;
    const result = await push.sendTestPush({
      to,
      key,
      lang: lang === 'fr' ? 'fr' : 'en',
      draft: draft?.title && draft?.body ? draft : null,
      inbox: req.body?.inbox === true,
    });
    console.log(`[push-automation] ${adminName(req)} sent test ${key} to ${to}: ${result.devices} phone(s)`);
    res.json({ success: true, data: { devices: result.devices, phones: result.phones } });
  } catch (error) {
    fail(res, error, 400);
  }
};

// GET /log?template=&status=&q=&limit=
const getLog = async (req, res) => {
  try {
    const filter = {};
    if (req.query.template) filter.template = String(req.query.template);
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.q) filter.email = { $regex: String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const rows = await PushAutomationLog.find(filter).sort({ at: -1 }).limit(limit).lean();
    res.json({ success: true, data: rows.map(({ _id, __v, ...r }) => ({ id: String(_id), ...r })) });
  } catch (error) {
    fail(res, error);
  }
};

// GET /upcoming  — what would be sent if it ran now (nothing is sent)
const getUpcoming = async (req, res) => {
  try {
    const result = await push.runPushAutomation({ dryRun: true, ignoreWindow: true });
    res.json({ success: true, data: { ...result, plan: result.plan.slice(0, 300) } });
  } catch (error) {
    fail(res, error);
  }
};

module.exports = { getOverview, updateSettings, saveTemplate, resetTemplate, preview, sendTest, getLog, getUpcoming };
