/**
 * emailBlastController.js
 *
 * GET  /api/email-blast/users  — returns all fashiontally_users from Firestore
 * POST /api/email-blast/send   — sends email to all or selected users via Mailtrap
 *
 * Fix: parallel sending (Promise.allSettled) to avoid 504 timeout,
 *      deduplication of users by email to fix duplicate React keys.
 */

const admin       = require('../firebase/firebase-admin');
const transporter = require('../config/mailtrap');

const db = admin.firestore();

// ── GET /api/email-blast/users ────────────────────────────────────────────────
const getFirebaseUsers = async (req, res) => {
  try {
    const snap = await db.collection('fashiontally_users').get();

    // Deduplicate by email (Firestore may have duplicates)
    const seen  = new Map();
    snap.forEach(doc => {
      const d     = doc.data();
      const email = (d.email || '').toLowerCase().trim();
      if (email && !seen.has(email)) {
        seen.set(email, {
          email,
          name: d.name || d.displayName || d.fullName || '',
        });
      }
    });

    const users = [...seen.values()].sort((a, b) =>
      (a.name || a.email).toLowerCase().localeCompare((b.name || b.email).toLowerCase())
    );

    res.json({ success: true, users });
  } catch (err) {
    console.error('[emailBlast] getFirebaseUsers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── HTML email template ───────────────────────────────────────────────────────
function buildHtml(subject, message) {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;
                background:#ffffff;border-radius:12px;overflow:hidden;
                border:1px solid #e5e7eb;">
      <div style="background:#16988d;padding:28px 40px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">FashionTally</h1>
      </div>
      <div style="padding:36px 40px;">
        <h2 style="color:#111827;font-size:18px;margin:0 0 16px 0;">${subject}</h2>
        <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px 0;">
          ${escaped}
        </p>
      </div>
      <div style="background:#f9fafb;padding:18px 40px;text-align:center;
                  border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">
          &copy; ${new Date().getFullYear()} FashionTally. All rights reserved.
        </p>
      </div>
    </div>
  `;
}

// Send emails in parallel batches to stay under SMTP connection limits
const BATCH_SIZE = 20;

async function sendInBatches(targets, html, subject) {
  let sent = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch   = targets.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(email =>
        transporter.sendMail({
          from:    '"FashionTally" <no-reply@fashiontally.com>',
          to:      email,
          subject: subject,
          html,
        })
      )
    );

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        sent++;
      } else {
        failed++;
        errors.push({ email: batch[idx], error: r.reason?.message || 'Unknown' });
        console.error(`[emailBlast] failed → ${batch[idx]}:`, r.reason?.message);
      }
    });
  }

  return { sent, failed, errors };
}

// ── POST /api/email-blast/send ────────────────────────────────────────────────
const sendEmailBlast = async (req, res) => {
  const { subject, message, recipients } = req.body || {};

  if (!subject || !String(subject).trim())
    return res.status(400).json({ success: false, error: 'Subject is required' });
  if (!message || !String(message).trim())
    return res.status(400).json({ success: false, error: 'Message is required' });
  if (!recipients)
    return res.status(400).json({ success: false, error: 'recipients is required' });

  try {
    // Pull + deduplicate users from Firestore
    const snap   = await db.collection('fashiontally_users').get();
    const seen   = new Set();
    const allEmails = [];
    snap.forEach(doc => {
      const email = (doc.data().email || '').toLowerCase().trim();
      if (email && !seen.has(email)) { seen.add(email); allEmails.push(email); }
    });

    // Filter to requested targets
    let targets = [];
    if (recipients === 'all') {
      targets = allEmails;
    } else if (Array.isArray(recipients)) {
      const want = new Set(recipients.map(e => e.toLowerCase().trim()));
      targets    = allEmails.filter(e => want.has(e));
    } else {
      return res.status(400).json({ success: false, error: 'recipients must be "all" or an array of emails' });
    }

    if (targets.length === 0)
      return res.status(400).json({ success: false, error: 'No matching users found' });

    const html = buildHtml(subject.trim(), message.trim());
    const { sent, failed, errors } = await sendInBatches(targets, html, subject.trim());

    console.log(`[emailBlast] done — sent:${sent} failed:${failed} total:${targets.length}`);

    res.json({
      success: true,
      sent,
      failed,
      total: targets.length,
      ...(errors.length ? { errors } : {}),
    });

  } catch (err) {
    console.error('[emailBlast] sendEmailBlast error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getFirebaseUsers, sendEmailBlast };
