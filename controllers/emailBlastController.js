/**
 * emailBlastController.js
 *
 * GET  /api/email-blast/users   — returns all fashiontally_users from MongoDB
 * POST /api/email-blast/send    — queues an email blast, sends 250/day via Brevo
 *                                 until all recipients are covered. State is
 *                                 persisted in email_blast_queue.json so server
 *                                 restarts don't lose progress.
 * GET  /api/email-blast/status  — returns current queue progress
 */

const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');
const { sendEmail } = require('../config/gmailTransporter');

// ── Queue state file ──────────────────────────────────────────────────────────
const QUEUE_FILE   = path.join(__dirname, '..', 'email_blast_queue.json');
const DAILY_LIMIT  = 250;   // emails to send per day
const BATCH_SIZE   = 10;    // parallel sends per mini-batch
const BATCH_DELAY  = 1000;  // ms between mini-batches

// ── Lightweight model ─────────────────────────────────────────────────────────
const User = mongoose.models.fashiontally_users ||
  mongoose.model('fashiontally_users',
    new mongoose.Schema({}, { strict: false, collection: 'fashiontally_users' })
  );

// ── Queue helpers ─────────────────────────────────────────────────────────────
function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[emailBlast] failed to read queue file:', e.message);
  }
  return null;
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function clearQueue() {
  if (fs.existsSync(QUEUE_FILE)) fs.unlinkSync(QUEUE_FILE);
}

// ── Today's date string (UTC) — used to reset daily counter ──────────────────
function todayUTC() {
  return new Date().toISOString().slice(0, 10); // "2025-07-14"
}

// ── Send up to DAILY_LIMIT emails from the queue ─────────────────────────────
let isSending = false;

async function processDailyBatch() {
  if (isSending) return;
  const queue = loadQueue();
  if (!queue || queue.remaining.length === 0) return;

  // Reset daily counter if it's a new day
  if (queue.lastSendDate !== todayUTC()) {
    queue.sentToday    = 0;
    queue.lastSendDate = todayUTC();
  }

  if (queue.sentToday >= DAILY_LIMIT) {
    console.log(`[emailBlast] Daily limit of ${DAILY_LIMIT} reached for ${queue.lastSendDate}. Will resume tomorrow.`);
    return;
  }

  isSending = true;
  const toSendToday = queue.remaining.slice(0, DAILY_LIMIT - queue.sentToday);
  console.log(`[emailBlast] Starting daily batch: ${toSendToday.length} emails (${queue.remaining.length} remaining total)`);

  let sent = 0, failed = 0;

  for (let i = 0; i < toSendToday.length; i += BATCH_SIZE) {
    const batch   = toSendToday.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(email => sendEmail({ to: email, subject: 'FashionTally', html: queue.html }))
    );

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        sent++;
        queue.sent++;
        queue.sentToday++;
        // Remove from remaining
        const pos = queue.remaining.indexOf(batch[idx]);
        if (pos !== -1) queue.remaining.splice(pos, 1);
      } else {
        failed++;
        console.error(`[emailBlast] ❌ ${batch[idx]}:`, r.reason?.message);
      }
    });

    // Save progress after every mini-batch so restarts don't lose it
    saveQueue(queue);
    console.log(`[emailBlast] mini-batch ${Math.floor(i / BATCH_SIZE) + 1}: sent=${sent} failed=${failed} remaining=${queue.remaining.length}`);

    if (i + BATCH_SIZE < toSendToday.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  if (queue.remaining.length === 0) {
    console.log(`[emailBlast] ✅ All done — total sent: ${queue.sent}, failed: ${failed}`);
    clearQueue();
  } else {
    console.log(`[emailBlast] 📅 Daily batch complete. ${queue.remaining.length} emails left — will continue tomorrow.`);
    saveQueue(queue);
    scheduleNextDay();
  }

  isSending = false;
}

// ── Schedule next run at midnight UTC + 1 min ────────────────────────────────
function scheduleNextDay() {
  const now      = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 1, 0));
  const msUntil  = tomorrow - now;
  console.log(`[emailBlast] Next batch scheduled in ${Math.round(msUntil / 1000 / 60)} minutes`);
  setTimeout(() => processDailyBatch(), msUntil);
}

// ── Resume any in-progress queue on server start ─────────────────────────────
(function resumeOnStart() {
  const queue = loadQueue();
  if (queue && queue.remaining.length > 0) {
    console.log(`[emailBlast] Resuming queue: ${queue.remaining.length} emails remaining`);
    processDailyBatch().catch(err => console.error('[emailBlast] resume error:', err.message));
  }
})();

// ── HTML template ─────────────────────────────────────────────────────────────
function buildHtml(message) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
      <style>
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
        <div style="background:#16988d;padding:28px 40px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">FashionTally</h1>
        </div>
        <div style="padding:36px 40px;color:#374151;font-size:15px;line-height:1.6;">
          <div class="ql-content">${message}</div>
        </div>
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

// ── GET /api/email-blast/users ────────────────────────────────────────────────
const getFirebaseUsers = async (req, res) => {
  try {
    const docs = await User.find({}, { email: 1, name: 1, _id: 0 }).lean();

    const seen = new Map();
    for (const d of docs) {
      const email = (d.email || '').toLowerCase().trim();
      if (email && !seen.has(email)) {
        seen.set(email, {
          email,
          name: d.name || d.displayName || d.fullName || '',
        });
      }
    }

    const users = [...seen.values()].sort((a, b) =>
      (a.name || a.email).toLowerCase().localeCompare((b.name || b.email).toLowerCase())
    );

    res.json({ success: true, users });
  } catch (err) {
    console.error('[emailBlast] getUsers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/email-blast/status ───────────────────────────────────────────────
const getBlastStatus = (req, res) => {
  const queue = loadQueue();
  if (!queue) {
    return res.json({ success: true, status: 'idle', message: 'No active email blast' });
  }
  res.json({
    success:   true,
    status:    'in_progress',
    total:     queue.total,
    sent:      queue.sent,
    remaining: queue.remaining.length,
    sentToday: queue.sentToday,
    dailyLimit: DAILY_LIMIT,
    startedAt: queue.startedAt,
    lastSendDate: queue.lastSendDate,
  });
};

// ── POST /api/email-blast/send ────────────────────────────────────────────────
const sendEmailBlast = async (req, res) => {
  const { message, recipients } = req.body || {};

  if (!message || !String(message).trim() || message === '<p><br></p>')
    return res.status(400).json({ success: false, error: 'Message is required' });
  if (!recipients)
    return res.status(400).json({ success: false, error: 'recipients is required' });

  // Block if a blast is already running
  if (loadQueue()) {
    return res.status(409).json({
      success: false,
      error: 'An email blast is already in progress. Check /api/email-blast/status',
    });
  }

  try {
    const docs      = await User.find({}, { email: 1, _id: 0 }).lean();
    const seen      = new Set();
    const allEmails = [];
    for (const d of docs) {
      const email = (d.email || '').toLowerCase().trim();
      if (email && !seen.has(email)) { seen.add(email); allEmails.push(email); }
    }

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
    const daysNeeded = Math.ceil(targets.length / DAILY_LIMIT);

    // Save queue to disk
    saveQueue({
      total:        targets.length,
      sent:         0,
      sentToday:    0,
      lastSendDate: todayUTC(),
      startedAt:    new Date().toISOString(),
      remaining:    targets,
      html,
    });

    res.status(202).json({
      success: true,
      message: `Email blast started. ${targets.length} emails will be sent ${DAILY_LIMIT}/day over ~${daysNeeded} day${daysNeeded !== 1 ? 's' : ''}.`,
      total:      targets.length,
      dailyLimit: DAILY_LIMIT,
      daysNeeded,
    });

    processDailyBatch().catch(err =>
      console.error('[emailBlast] processDailyBatch error:', err.message)
    );

  } catch (err) {
    console.error('[emailBlast] sendEmailBlast error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
};

module.exports = { getFirebaseUsers, sendEmailBlast, getBlastStatus };
