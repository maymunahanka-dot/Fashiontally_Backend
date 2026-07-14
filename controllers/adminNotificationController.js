const User                   = require('../models/User');
const BroadcastNotification  = require('../models/BroadcastNotification');
const admin                  = require('../firebase/firebase-admin');


const sendBroadcast = async (req, res) => {
  try {
    const { title, body } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, error: 'Message body is required' });
    }

    // ── 1. Fetch all users that have at least one enabled token ───────────
    const users = await User.find(
      { 'fcmTokens': { $elemMatch: { enabled: true } } },
      { _id: 1, email: 1, fcmTokens: 1 }
    ).lean();

    console.log(`[broadcast] Found ${users.length} users with enabled FCM tokens`);

    if (users.length === 0) {
      // Save a record anyway so admin can see it in history
      await BroadcastNotification.create({
        title:         title.trim(),
        body:          body.trim(),
        totalTargeted: 0,
        delivered:     0,
        failed:        0,
      });
      return res.json({
        success:  true,
        message:  'Notification saved, but no users have push notifications enabled.',
        targeted: 0,
        delivered: 0,
        failed:   0,
      });
    }

    // ── 2. Build one FCM message per enabled token across all users ───────
    const messages = [];
    const tokenToUser = {}; // token → user email (for logging)

    for (const user of users) {
      const enabledTokens = (user.fcmTokens || []).filter(d => d.enabled && d.token);
      for (const device of enabledTokens) {
        messages.push({
          token: device.token,
          notification: { title: title.trim(), body: body.trim() },
          android: {
            priority: 'high',
            notification: { sound: 'default' },
          },
          apns: {
            payload: { aps: { sound: 'default' } },
          },
        });
        tokenToUser[device.token] = user.email;
      }
    }

    console.log(`[broadcast] Sending to ${messages.length} device tokens across ${users.length} users`);

    // ── 3. Send in batches of 500 (FCM sendEach limit) ────────────────────
    let totalDelivered = 0;
    let totalFailed    = 0;
    const invalidTokensByUser = {}; // userId → [token]

    const BATCH_SIZE = 500;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch    = messages.slice(i, i + BATCH_SIZE);
      const response = await admin.messaging().sendEach(batch);

      totalDelivered += response.successCount;
      totalFailed    += response.failureCount;

      // Collect invalid tokens to remove from DB
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          const token = batch[idx].token;
          console.warn(`[broadcast] Failed for ${tokenToUser[token] || token.slice(0, 20)} — ${code}: ${resp.error?.message}`);

          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            // Find the userId for this token
            const userWithToken = users.find(u =>
              u.fcmTokens.some(d => d.token === token)
            );
            if (userWithToken) {
              const uid = String(userWithToken._id);
              if (!invalidTokensByUser[uid]) invalidTokensByUser[uid] = [];
              invalidTokensByUser[uid].push(token);
            }
          }
        }
      });
    }

    // ── 4. Clean up stale tokens ──────────────────────────────────────────
    const staleEntries = Object.entries(invalidTokensByUser);
    if (staleEntries.length > 0) {
      console.log(`[broadcast] Removing stale tokens from ${staleEntries.length} users`);
      await Promise.all(
        staleEntries.map(([userId, tokens]) =>
          User.updateOne(
            { _id: userId },
            { $pull: { fcmTokens: { token: { $in: tokens } } } }
          )
        )
      );
    }

    // ── 5. Save broadcast record ──────────────────────────────────────────
    const record = await BroadcastNotification.create({
      title:         title.trim(),
      body:          body.trim(),
      totalTargeted: users.length,
      delivered:     totalDelivered,
      failed:        totalFailed,
    });

    console.log(`[broadcast] ✅ Done — targeted: ${users.length}, delivered: ${totalDelivered}, failed: ${totalFailed}`);

    res.json({
      success:   true,
      message:   'Broadcast sent',
      id:        record._id,
      targeted:  users.length,
      delivered: totalDelivered,
      failed:    totalFailed,
    });

  } catch (error) {
    console.error('❌ Broadcast notification error:', error);
    res.status(500).json({ success: false, error: 'Failed to send notification. Please try again.' });
  }
};

/**
 * GET /api/admin/notifications
 * Returns all past broadcasts, newest first.
 */
const getBroadcasts = async (req, res) => {
  try {
    const records = await BroadcastNotification.find({}).sort({ sentAt: -1 }).lean();

    const data = records.map(r => ({
      id:            r._id,
      title:         r.title,
      body:          r.body,
      sentAt:        r.sentAt,
      totalTargeted: r.totalTargeted,
      delivered:     r.delivered,
      failed:        r.failed,
      deliveryRate:  r.totalTargeted > 0
        ? Math.round((r.delivered / r.totalTargeted) * 100)
        : 0,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Get broadcasts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
  }
};

module.exports = { sendBroadcast, getBroadcasts };
