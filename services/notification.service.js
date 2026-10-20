

const admin = require('../firebase/firebase-admin');
const User  = require('../models/User');
<<<<<<< HEAD
const { sendApns } = require('./apns.service');
=======

>>>>>>> 96435ed6cc74acc54d6bb08bdbad855f2751637c

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

<<<<<<< HEAD
    const dataPayload = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );
    const result = await deliverPush(enabledTokens, title, body, dataPayload);
    console.log(`[notification] Sent to ${user.email} — success: ${result.delivered}, failed: ${result.failed}`);
    const invalidTokens = result.invalidTokens;
=======
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
>>>>>>> 96435ed6cc74acc54d6bb08bdbad855f2751637c

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

<<<<<<< HEAD
async function deliverPush(devices, title, body, data = {}) {
  const iosDevices = devices.filter((d) => d.platform === 'ios' && d.token);
  const fcmDevices = devices.filter((d) => d.platform !== 'ios' && d.token);
  let delivered = 0;
  let failed = 0;
  const invalidTokens = [];

  if (fcmDevices.length > 0) {
    const messages = fcmDevices.map((d) => ({
      token: d.token,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: { sound: 'default', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
      },
    }));

    for (let i = 0; i < messages.length; i += 500) {
      const batch = messages.slice(i, i + 500);
      const batchResponse = await admin.messaging().sendEach(batch);
      delivered += batchResponse.successCount;
      failed += batchResponse.failureCount;
      batchResponse.responses.forEach((resp, idx) => {
        if (resp.success) return;
        const code = resp.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(batch[idx].token);
        } else {
          console.error(`[notification] FCM failed (${code}):`, resp.error?.message);
        }
      });
    }
  }

  for (const device of iosDevices) {
    const result = await sendApns(device.token, title, body, data);
    if (result.success) {
      delivered += 1;
    } else {
      failed += 1;
      if (result.invalid) invalidTokens.push(device.token);
      else console.error('[notification] APNs failed:', result.message);
    }
  }

  return { delivered, failed, invalidTokens };
}

=======
>>>>>>> 96435ed6cc74acc54d6bb08bdbad855f2751637c
const sendNotificationToMany = async (userIds, title, body, data = {}) => {
  await Promise.all(userIds.map(id => sendNotification(id, title, body, data)));
};

<<<<<<< HEAD
module.exports = { sendNotification, sendNotificationToMany, deliverPush };
=======
module.exports = { sendNotification, sendNotificationToMany };
>>>>>>> 96435ed6cc74acc54d6bb08bdbad855f2751637c
