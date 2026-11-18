const User = require('../models/User');
const AuthUser = require('../models/AuthUser');
const EmailCampaign = require('../models/EmailCampaign');
const { subscriptionSummary } = require('../services/subscriptionSummary');
const { buildAdminMessageEmail, sendAdminMessageEmail } = require('../services/emailService');
const queue = require('../services/adminEmailQueue.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_MAX = 150;
const MESSAGE_MAX = 5000;

/** Groups used to pick recipients by plan */
const STATUS_GROUPS = {
  trial: { label: 'On free trial', match: (s) => s === 'trial' },
  paid: { label: 'Paid plan', match: (s) => s === 'active' },
  expired: { label: 'Trial ended / plan expired', match: (s) => ['trial_ended', 'expired', 'cancelled'].includes(s) },
  free: { label: 'No plan', match: (s) => s === 'free' },
};
const groupOf = (status) => Object.keys(STATUS_GROUPS).find((k) => STATUS_GROUPS[k].match(status)) || 'free';

const disabledMessage =
  'Email sending is turned off on this server (local development). Send campaigns from the live admin panel.';

/**
 * Everyone who can receive an admin email: real address, account not disabled, not unsubscribed,
 * not a phone-only account (those have a placeholder address). One entry per address.
 */
const loadAudience = async () => {
  const [users, disabled] = await Promise.all([
    User.find(
      {},
      'name email isPhoneBasedAccount emailOptOut country subscriptionType planType subscriptionStartDate subscriptionEndDate trialStartDate billingCycle isSubscribed payment_amount payment_date'
    ).lean(),
    AuthUser.find({ disabled: true }, 'email').lean(),
  ]);
  const disabledSet = new Set(disabled.map((a) => String(a.email).toLowerCase()));
  const now = Date.now();
  const seen = new Set();
  const eligible = [];
  const excluded = { optedOut: 0, phoneOnly: 0, disabled: 0, invalid: 0 };

  for (const u of users) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { excluded.invalid += 1; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    if (u.isPhoneBasedAccount) { excluded.phoneOnly += 1; continue; }
    if (disabledSet.has(email)) { excluded.disabled += 1; continue; }
    if (u.emailOptOut) { excluded.optedOut += 1; continue; }
    const sum = subscriptionSummary(u, now);
    const status = !u.subscriptionType && !sum.endDate ? 'free' : sum.status;
    eligible.push({
      email,
      name: u.name || '',
      group: groupOf(status),
      plan: sum.plan || '',
      country: u.country || '',
    });
  }
  return { eligible, excluded };
};

const summarize = (c, plan) => {
  const counts = queue.countRecipients(c.recipients);
  return {
    id: String(c._id),
    subject: c.subject,
    message: c.message,
    audienceType: c.audienceType,
    audienceLabel: c.audienceLabel,
    status: c.status,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    completedAt: c.completedAt,
    cancelledAt: c.cancelledAt,
    counts,
    batches: plan?.get(String(c._id)) || [],
  };
};

/** Delivery plan for every campaign still sending */
const currentPlan = async (quota) => {
  const open = await EmailCampaign.find({ status: 'sending' }, 'createdAt recipients.status').lean();
  return queue.planBatches(
    open.map((c) => ({ id: c._id, createdAt: c.createdAt, waiting: queue.countRecipients(c.recipients).waiting })),
    { leftToday: quota.enabled ? quota.leftToday : 0, limit: quota.limit, today: quota.day }
  );
};

// GET /audience: who can be emailed, with counts per group
const getAudience = async (req, res) => {
  try {
    const { eligible, excluded } = await loadAudience();
    const groups = Object.fromEntries(
      Object.entries(STATUS_GROUPS).map(([k, g]) => [k, { label: g.label, count: eligible.filter((u) => u.group === k).length }])
    );
    res.json({ success: true, data: { users: eligible, total: eligible.length, groups, excluded } });
  } catch (error) {
    console.error('[admin-email] audience:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /quota: today's allowance and how much is waiting
const getQuota = async (req, res) => {
  try {
    const quota = await queue.quotaStatus();
    const open = await EmailCampaign.find({ status: 'sending' }, 'recipients.status').lean();
    const waiting = open.reduce((t, c) => t + queue.countRecipients(c.recipients).waiting, 0);
    // Days with a batch: today (if any allowance is left) plus the full days after it
    const todayShare = Math.min(waiting, quota.enabled ? quota.leftToday : 0);
    const daysToClear = (todayShare > 0 ? 1 : 0) + Math.ceil((waiting - todayShare) / quota.limit);
    res.json({ success: true, data: { ...quota, waiting, daysToClear } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /: campaigns, newest first, without the recipient lists
const listCampaigns = async (req, res) => {
  try {
    const quota = await queue.quotaStatus();
    const [campaigns, plan] = await Promise.all([
      EmailCampaign.find({}, '-recipients.name -recipients.error -recipients.claimedAt -recipients.sentAt -recipients.email')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      currentPlan(quota),
    ]);
    res.json({ success: true, data: campaigns.map((c) => summarize(c, plan)) });
  } catch (error) {
    console.error('[admin-email] list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /:id: one campaign with its recipients
const getCampaign = async (req, res) => {
  try {
    const c = await EmailCampaign.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ success: false, error: 'Email not found' });
    const plan = await currentPlan(await queue.quotaStatus());
    res.json({
      success: true,
      data: {
        ...summarize(c, plan),
        recipients: c.recipients.map((r) => ({ email: r.email, name: r.name, status: r.status, sentAt: r.sentAt, error: r.error })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const readMessage = (body) => {
  const subject = String(body?.subject || '').trim();
  const message = String(body?.message || '').trim();
  if (!subject) return { error: 'Subject is required' };
  if (!message) return { error: 'Message is required' };
  if (subject.length > SUBJECT_MAX) return { error: `Subject is too long (max ${SUBJECT_MAX} characters)` };
  if (message.length > MESSAGE_MAX) return { error: `Message is too long (max ${MESSAGE_MAX} characters)` };
  return { subject, message };
};

// POST /preview: the email exactly as users will get it
const previewEmail = async (req, res) => {
  const { subject, message } = req.body || {};
  const name = String(req.body?.name || 'Ada Okafor');
  const built = buildAdminMessageEmail('ada@example.com', {
    name,
    subject: subject || 'Your subject',
    message: message || 'Your message will appear here.',
    campaign: true,
  });
  res.json({ success: true, data: built });
};

// POST /: create a campaign and start sending today's share
const createCampaign = async (req, res) => {
  try {
    if (!queue.sendingEnabled()) return res.status(503).json({ success: false, error: disabledMessage });
    const msg = readMessage(req.body);
    if (msg.error) return res.status(400).json({ success: false, error: msg.error });

    const audience = req.body?.audience || {};
    const { eligible } = await loadAudience();
    let recipients;
    let audienceLabel;

    if (audience.type === 'selected') {
      const wanted = new Set((Array.isArray(audience.emails) ? audience.emails : []).map((e) => String(e).trim().toLowerCase()));
      recipients = eligible.filter((u) => wanted.has(u.email));
      audienceLabel = `${recipients.length} selected user${recipients.length === 1 ? '' : 's'}`;
    } else if (audience.type === 'status') {
      const groups = (Array.isArray(audience.statuses) ? audience.statuses : []).filter((g) => STATUS_GROUPS[g]);
      if (!groups.length) return res.status(400).json({ success: false, error: 'Pick at least one group' });
      recipients = eligible.filter((u) => groups.includes(u.group));
      audienceLabel = groups.map((g) => STATUS_GROUPS[g].label).join(', ');
    } else {
      recipients = eligible;
      audienceLabel = 'All users';
    }

    if (!recipients.length) return res.status(400).json({ success: false, error: 'No one to send to' });

    const campaign = await EmailCampaign.create({
      subject: msg.subject,
      message: msg.message,
      audienceType: ['selected', 'status'].includes(audience.type) ? audience.type : 'all',
      audienceLabel,
      recipients: recipients.map((u) => ({ email: u.email, name: u.name })),
      createdBy: req.admin?.label || 'Admin',
    });

    const quota = await queue.quotaStatus();
    const plan = await currentPlan(quota);
    queue.kickQueue();
    res.status(201).json({ success: true, data: summarize(campaign.toObject(), plan) });
  } catch (error) {
    console.error('[admin-email] create:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /test: one copy to an address the admin types (counts toward today's allowance)
const sendTest = async (req, res) => {
  try {
    if (!queue.sendingEnabled()) return res.status(503).json({ success: false, error: disabledMessage });
    const to = String(req.body?.to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(to)) return res.status(400).json({ success: false, error: 'Enter a valid email address' });
    const msg = readMessage(req.body);
    if (msg.error) return res.status(400).json({ success: false, error: msg.error });
    if (!(await queue.claimQuota())) {
      return res.status(429).json({ success: false, error: "Today's email allowance is used up. Try again tomorrow." });
    }
    const result = await sendAdminMessageEmail(to, { name: 'there', subject: `[Test] ${msg.subject}`, message: msg.message, campaign: true });
    if (!result.success) {
      await queue.refundQuota();
      return res.status(502).json({ success: false, error: result.error || 'Could not send' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /:id/cancel: stop the emails that haven't gone out yet
const cancelCampaign = async (req, res) => {
  try {
    const r = await EmailCampaign.updateOne(
      { _id: req.params.id, status: 'sending' },
      { $set: { status: 'cancelled', cancelledAt: new Date(), 'recipients.$[q].status': 'cancelled' } },
      { arrayFilters: [{ 'q.status': 'queued' }] }
    );
    if (!r.matchedCount) return res.status(400).json({ success: false, error: 'This email is not sending any more' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /:id/retry: queue the failed ones again
const retryFailed = async (req, res) => {
  try {
    if (!queue.sendingEnabled()) return res.status(503).json({ success: false, error: disabledMessage });
    const r = await EmailCampaign.updateOne(
      { _id: req.params.id, status: { $ne: 'cancelled' }, 'recipients.status': 'failed' },
      { $set: { status: 'sending', completedAt: null, 'recipients.$[f].status': 'queued', 'recipients.$[f].error': '' } },
      { arrayFilters: [{ 'f.status': 'failed' }] }
    );
    if (!r.matchedCount) return res.status(400).json({ success: false, error: 'Nothing to retry' });
    queue.kickQueue();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /:id: remove a finished or cancelled email from the history
const deleteCampaign = async (req, res) => {
  try {
    const r = await EmailCampaign.deleteOne({ _id: req.params.id, status: { $ne: 'sending' } });
    if (!r.deletedCount) return res.status(400).json({ success: false, error: 'Cancel the email before deleting it' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAudience,
  getQuota,
  listCampaigns,
  getCampaign,
  previewEmail,
  createCampaign,
  sendTest,
  cancelCampaign,
  retryFailed,
  deleteCampaign,
  loadAudience,
};
