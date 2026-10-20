
const User                  = require('../models/User');
const BroadcastNotification = require('../models/BroadcastNotification');
const { deliverPush }       = require('../services/notification.service');

const sendBroadcast = async (req, res) => {
  try {
    const { title, body } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, error: 'Message body is required' });
    }

    // ── 1. Fetch all users with at least one enabled token ────────────────
    const users = await User.find(
      { fcmTokens: { $elemMatch: { enabled: true } } },
      { _id: 1, email: 1, fcmTokens: 1 }
    ).lean();

    console.log(`[broadcast] Found ${users.length} users with enabled FCM tokens`);

    if (users.length === 0) {
      await BroadcastNotification.create({
        title: title.trim(), body: body.trim(),
        totalTargeted: 0, delivered: 0, failed: 0,
      });
      return res.json({
        success: true,
        message: 'Notification saved, but no users have push notifications enabled.',
        targeted: 0, delivered: 0, failed: 0,
      });
    }

    // ── 2. Flatten all enabled devices ────────────────────────────────────
    const devices = [];
    for (const user of users) {
      for (const d of (user.fcmTokens || [])) {
        if (d.enabled && d.token) {
          devices.push({ token: d.token, platform: d.platform });
        }
      }
    }

    console.log(`[broadcast] Sending to ${devices.length} device tokens across ${users.length} users`);

    // ── 3. Deliver (handles Android/web via FCM, iOS via APNs) ───────────
    const result = await deliverPush(devices, title.trim(), body.trim());

    // ── 4. Clean up stale tokens ──────────────────────────────────────────
    const invalidTokensByUser = {};
    for (const token of result.invalidTokens) {
      const userWithToken = users.find(u => (u.fcmTokens || []).some(d => d.token === token));
      if (!userWithToken) continue;
      const uid = String(userWithToken._id);
      if (!invalidTokensByUser[uid]) invalidTokensByUser[uid] = [];
      invalidTokensByUser[uid].push(token);
    }

    const staleEntries = Object.entries(invalidTokensByUser);
    if (staleEntries.length > 0) {
      console.log(`[broadcast] Removing stale tokens from ${staleEntries.length} users`);
      await Promise.all(
        staleEntries.map(([userId, tokens]) =>
          User.updateOne({ _id: userId }, { $pull: { fcmTokens: { token: { $in: tokens } } } })
        )
      );
    }

    // ── 5. Save broadcast record ──────────────────────────────────────────
    const record = await BroadcastNotification.create({
      title:         title.trim(),
      body:          body.trim(),
      totalTargeted: users.length,
      delivered:     result.delivered,
      failed:        result.failed,
    });

    console.log(`[broadcast] ✅ Done — targeted: ${users.length}, delivered: ${result.delivered}, failed: ${result.failed}`);

    res.json({
      success:   true,
      message:   'Broadcast sent',
      id:        record._id,
      targeted:  users.length,
      delivered: result.delivered,
      failed:    result.failed,
    });

  } catch (error) {
    console.error('❌ Broadcast notification error:', error);
    res.status(500).json({ success: false, error: 'Failed to send notification. Please try again.' });
  }
};

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
