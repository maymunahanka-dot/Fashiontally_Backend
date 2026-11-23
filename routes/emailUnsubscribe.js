/**
 * /api/email/unsubscribe?e=<email>&t=<token>
 * Link at the bottom of automated marketing emails (and Gmail's one-click unsubscribe, POST).
 * Sets the same opt-out admin campaigns use (emailOptOut); account emails still go out.
 */
const crypto = require('crypto');
const express = require('express');
const User = require('../models/User');
const { unsubscribeToken } = require('../services/emailAutomation');

const router = express.Router();

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const validToken = (email, token) => {
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(String(token || ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

const TEXT = {
  en: {
    title: "You're unsubscribed",
    body: "You won't receive tips and updates from FashionTally any more. Emails about your own account, like sign-in codes, receipts and plan reminders, will still reach you.",
    bad: 'This unsubscribe link is not valid.',
  },
  fr: {
    title: 'Vous êtes désabonné(e)',
    body: "Vous ne recevrez plus les conseils et nouveautés de FashionTally. Les e-mails concernant votre compte (codes de connexion, reçus, rappels de forfait) vous parviendront toujours.",
    bad: "Ce lien de désabonnement n'est pas valide.",
  },
};

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#050505;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#f3f3f1;">
<div style="max-width:480px;margin:80px auto;padding:36px;border-radius:20px;background:#0d0d0d;border:1px solid rgba(255,255,255,0.09);">
<div style="font-size:16px;font-weight:600;margin-bottom:28px;">FashionTally</div>
<h1 style="font-size:24px;margin:0 0 14px 0;">${title}</h1>
<p style="font-size:15px;line-height:1.7;color:rgba(243,243,241,0.72);margin:0;">${body}</p>
</div></body></html>`;

const handle = async (req, res) => {
  const email = String(req.query.e || '').trim().toLowerCase();
  const user = email
    ? await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') }, 'email language').lean().catch(() => null)
    : null;
  const t = TEXT[user?.language === 'fr' ? 'fr' : 'en'];

  if (!email || !validToken(email, req.query.t)) {
    return res.status(400).type('html').send(page(t.bad, ''));
  }
  if (user) {
    await User.updateOne({ _id: user._id }, { $set: { emailOptOut: true, emailOptOutAt: new Date().toISOString() } });
    console.log(`[unsubscribe] ${email} unsubscribed from marketing emails`);
  }
  if (req.method === 'POST') return res.status(200).send('ok');
  return res.type('html').send(page(t.title, t.body));
};

router.get('/', (req, res) => handle(req, res).catch(() => res.status(500).send('Something went wrong')));
router.post('/', (req, res) => handle(req, res).catch(() => res.status(500).send('Something went wrong')));

module.exports = router;
