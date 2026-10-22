const User                   = require('../models/User');
const BroadcastNotification  = require('../models/BroadcastNotification');
const { deliverPush }        = require('../services/notification.service');


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

    const devices = [];
    for (const user of users) {
      const enabledTokens = (user.fcmTokens || []).filter(d => d.enabled && d.token);
      for (const device of enabledTokens) {
        devices.push({ token: device.token, platform: device.platform });
      }
    }

    console.log(`[broadcast] Sending to ${devices.length} device tokens across ${users.length} users`);

    const result = await deliverPush(devices, title.trim(), body.trim());
    const totalDelivered = result.delivered;
    const totalFailed = result.failed;
    const invalidTokensByUser = {};

    for (const token of result.invalidTokens) {
      const userWithToken = users.find(u =>
        (u.fcmTokens || []).some(d => d.token === token)
      );
      if (!userWithToken) continue;
      const uid = String(userWithToken._id);
      if (!invalidTokensByUser[uid]) invalidTokensByUser[uid] = [];
      invalidTokensByUser[uid].push(token);
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
