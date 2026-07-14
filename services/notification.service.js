

const admin = require('../firebase/firebase-admin');
const User  = require('../models/User');


const sendNotification = async (userId, title, body, data = {}) => {
  try {
    // ── 1. Fetch user and their device tokens ───────────────
    const user = await User.findById(userId).select('fcmTokens email name');

    if (!user) {
      console.warn(`[notification] User not found: ${userId}`);
      return;
    }

    if (!user.fcmTokens || user.fcmTokens.length === 0) {
      console.warn(`[notification] No devices registered for: ${user.email}`);
      return;
    }

    // ── 2. Filter — only send to devices where enabled === true ─
    const enabledTokens = user.fcmTokens.filter(d => d.enabled === true && d.token);

    if (enabledTokens.length === 0) {
      console.log(`[notification] All devices disabled for: ${user.email} — skipping`);
      return;
    }

    // ── 3. Build one FCM message per enabled device token ───
    const dataPayload = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );

    const messages = enabledTokens.map(d => ({
      token: d.token,
      notification: { title, body },
      data: dataPayload,
      android: {
        priority: 'high',
        notification: { sound: 'default', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
      },
      apns: {
        payload: { aps: { sound: 'default' } },
      },
    }));

    // ── 4. Send to all enabled devices in one batch call ────
    const batchResponse = await admin.messaging().sendEach(messages);

    console.log(`[notification] Sent to ${user.email} — success: ${batchResponse.successCount}, failed: ${batchResponse.failureCount}`);

    // ── 5. Auto-remove invalid / expired tokens ─────────────
    const invalidTokens = [];

    batchResponse.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(enabledTokens[idx].token);
          console.warn(`[notification] Removing stale token for ${user.email}: ${enabledTokens[idx].token.slice(0, 20)}...`);
        } else {
          console.error(`[notification] Send failed for ${user.email} (${code}):`, resp.error?.message);
        }
      }
    });

    // Pull invalid tokens out of the DB
    if (invalidTokens.length > 0) {
      await User.updateOne(
        { _id: userId },
        { $pull: { fcmTokens: { token: { $in: invalidTokens } } } }
      );
    }

  } catch (error) {
    // Never crash the caller — notifications are non-critical
    console.error(`[notification] ❌ Unexpected error for userId ${userId}:`, error.message);
  }
};

const sendNotificationToMany = async (userIds, title, body, data = {}) => {
  await Promise.all(userIds.map(id => sendNotification(id, title, body, data)));
};

module.exports = { sendNotification, sendNotificationToMany };
