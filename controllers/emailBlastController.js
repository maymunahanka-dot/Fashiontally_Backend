/**
 * emailBlastController.js
 *
 * GET  /api/email-blast/users  — returns all fashiontally_users from Firestore
 * POST /api/email-blast/send   — sends email to all or selected users via Gmail SMTP,
 *                                responds immediately (202) and sends in background
 *                                to avoid nginx gateway timeout.
 */

const admin            = require('../firebase/firebase-admin');
const { sendEmail }    = require('../config/gmailTransporter');

const db = admin.firestore();

// ── GET /api/email-blast/users ────────────────────────────────────────────────
const getFirebaseUsers = async (req, res) => {
  try {
    const snap = await db.collection('fashiontally_users').get();

    // Deduplicate by email
    const seen = new Map();
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

// ── HTML template ─────────────────────────────────────────────────────────────
// message is already HTML (from Quill rich text editor) — render it directly
function buildHtml(message) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
      <style>
        /* Reset Quill's default font inside email */
        body { margin:0; padding:0; background:#f4f6f9; }
        .ql-content p  { margin:0 0 6px 0; }
        .ql-content ul,
        .ql-content ol { padding-left:20px; margin:0 0 3px 0; }
        .ql-content h1 { font-size:22px; margin:0 0 12px 0; }
        .ql-content h2 { font-size:18px; margin:0 0 10px 0; }
        .ql-content h3 { font-size:15px; margin:0 0 8px  0; }
        .ql-content a  { color:#16988d; }
        .ql-content blockquote {
          border-left:4px solid #16988d;
          margin:0 0 12px 0;
          padding:6px 12px;
          color:#555;
          background:#f0faf9;
        }
        .ql-content pre {
          background:#f3f4f6;
          padding:12px;
          border-radius:6px;
          font-size:13px;
          overflow-x:auto;
        }
      </style>
    </head>
    <body>
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:32px auto;
                  background:#ffffff;border-radius:12px;overflow:hidden;
                  border:1px solid #e5e7eb;">
        <!-- Header -->
        <div style="background:#16988d;padding:28px 40px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">FashionTally</h1>
        </div>
        <!-- Body -->
        <div style="padding:36px 40px;color:#374151;font-size:15px;line-height:1;">
          <div class="ql-content">${message}</div>
        </div>
        <!-- Footer -->
        <div style="background:#f9fafb;padding:18px 40px;text-align:center;
                    border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:11px;margin:0;">
            &copy; ${new Date().getFullYear()} FashionTally. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ── Send in parallel batches of 10 (Gmail rate limit safe) ───────────────────
const BATCH_SIZE = 10;

async function sendInBackground(targets, html) {
  let sent = 0, failed = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch   = targets.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(email => sendEmail({ to: email, subject: 'FashionTally', html }))
    );

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        sent++;
      } else {
        failed++;
        console.error(`[emailBlast] ❌ ${batch[idx]}:`, r.reason?.message);
      }
    });

    console.log(`[emailBlast] batch ${Math.floor(i / BATCH_SIZE) + 1}: sent=${sent} failed=${failed}`);

    // Small delay between batches to respect Gmail's sending limits
    if (i + BATCH_SIZE < targets.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`[emailBlast] ✅ done — sent:${sent} failed:${failed} total:${targets.length}`);
}

// ── POST /api/email-blast/send ────────────────────────────────────────────────
const sendEmailBlast = async (req, res) => {
  const { message, recipients } = req.body || {};

  if (!message || !String(message).trim() || message === '<p><br></p>')
    return res.status(400).json({ success: false, error: 'Message is required' });
  if (!recipients)
    return res.status(400).json({ success: false, error: 'recipients is required' });

  try {
    // Fetch + deduplicate from Firestore
    const snap      = await db.collection('fashiontally_users').get();
    const seen      = new Set();
    const allEmails = [];
    snap.forEach(doc => {
      const email = (doc.data().email || '').toLowerCase().trim();
      if (email && !seen.has(email)) { seen.add(email); allEmails.push(email); }
    });

    // Resolve targets
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

    const html = buildHtml(message.trim());

    // Respond immediately — don't wait for emails to finish
    res.status(202).json({
      success: true,
      message: `Email blast queued for ${targets.length} recipient${targets.length !== 1 ? 's' : ''}. Sending in background.`,
      total:   targets.length,
    });

    // Send in background after response is flushed
    sendInBackground(targets, html).catch(err =>
      console.error('[emailBlast] background send error:', err.message)
    );

  } catch (err) {
    console.error('[emailBlast] sendEmailBlast error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
};

module.exports = { getFirebaseUsers, sendEmailBlast };
