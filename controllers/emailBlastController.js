/**
 * emailBlastController.js
 *
 * GET  /api/email-blast/users  — returns all fashiontally_users from Firestore
 * POST /api/email-blast/send   — sends an email to all or selected users via Mailtrap
 */

const admin       = require('../firebase/firebase-admin');
const transporter = require('../config/mailtrap');

const db = admin.firestore();

// ── GET /api/email-blast/users ────────────────────────────────────────────────
const getFirebaseUsers = async (req, res) => {
  try {
    const snap  = await db.collection('fashiontally_users').get();
    const users = [];

    snap.forEach(doc => {
      const d = doc.data();
      if (d.email) {
        users.push({
          email: (d.email || '').toLowerCase().trim(),
          name:  d.name || d.displayName || d.fullName || '',
        });
      }
    });

    users.sort((a, b) => {
      const na = (a.name || a.email).toLowerCase();
      const nb = (b.name || b.email).toLowerCase();
      return na.localeCompare(nb);
    });

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
    // Pull all users from Firestore
    const snap     = await db.collection('fashiontally_users').get();
    let allUsers   = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.email) allUsers.push((d.email || '').toLowerCase().trim());
    });

    // Decide targets
    let targets = [];
    if (recipients === 'all') {
      targets = allUsers;
    } else if (Array.isArray(recipients)) {
      const set = new Set(recipients.map(e => e.toLowerCase().trim()));
      targets   = allUsers.filter(e => set.has(e));
    } else {
      return res.status(400).json({ success: false, error: 'recipients must be "all" or an array of emails' });
    }

    if (targets.length === 0)
      return res.status(400).json({ success: false, error: 'No matching users found' });

    const html   = buildHtml(subject.trim(), message.trim());
    let sent     = 0;
    let failed   = 0;
    const errors = [];

    for (const email of targets) {
      try {
        await transporter.sendMail({
          from:    '"FashionTally" <no-reply@fashiontally.com>',
          to:      email,
          subject: subject.trim(),
          html,
        });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ email, error: err.message });
        console.error(`[emailBlast] failed → ${email}:`, err.message);
      }
    }

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
