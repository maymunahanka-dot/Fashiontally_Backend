

const admin = require('../firebase/firebase-admin');
const User  = require('../models/User');
const { sendApns } = require('./apns.service');

/**
 * Web page each notification type opens when clicked (the mobile app maps
 * `type` to its own screens). Sent as `data.url`.
 */
const WEB_PATHS = {
  login:                  '/dashboard/settings',
  password_changed:       '/dashboard/settings',
  team_member_added:      '/dashboard/settings',
  team_member_removed:    '/dashboard/settings',
  support_ticket:         '/dashboard/settings',
  payment_success:        '/subscription',
  subscription_cancelled: '/subscription',
  plan_ending:            '/subscription',
  plan_expired:           '/subscription',
  low_stock:              '/dashboard/inventory',
  appointments:           '/dashboard/appointments',
  appointment_soon:       '/dashboard/appointments',
  pending_orders:         '/dashboard/orders',
  order_due:              '/dashboard/orders',
  order_overdue:          '/dashboard/orders',
  invoice_overdue:        '/dashboard/invoice',
};

/**
 * Notification types that are also saved for the inbox (web notification panel and
 * the app's notification screen), so they can be seen later even without a phone.
 */
const INBOX_TYPES = new Set(['payment_success', 'plan_ending', 'plan_expired', 'subscription_cancelled']);

/** Saves an inbox copy. Never throws: a failed save must not stop the push. */
const saveToInbox = async (user, title, body, data) => {
  if (!INBOX_TYPES.has(data?.type)) return;
  try {
    const UserNotification = require('../models/UserNotification');
    await UserNotification.create({
      email: user.email,
      type: data.type,
      title,
      body,
      url: WEB_PATHS[data.type] || '',
    });
  } catch (error) {
    console.error(`[notification] inbox save failed for ${user.email}:`, error.message);
  }
};

/**
 * Which of the account's devices a notification goes to:
 *   'everyone' — owner and team members (business alerts: orders, stock, ...)
 *   'owner'    — only the account owner (billing, security, team changes)
 *   { email }  — only devices signed in as that person
 * Devices registered before sign-ins were tracked (signedInAs '') count as the owner's.
 */
const devicesFor = (user, audience) => {
  const enabled = (user.fcmTokens || []).filter((d) => d.enabled === true && d.token);
  if (!audience || audience === 'everyone') return enabled;
  const who = audience === 'owner' ? user.email : String(audience.email || '').toLowerCase();
  return enabled.filter((d) => {
    const signedInAs = String(d.signedInAs || '').toLowerCase();
    return signedInAs === who || (!signedInAs && who === String(user.email).toLowerCase());
  });
};

/**
 * @param {string} userId - owner's User _id
 * @param {object} [options]
 * @param {'everyone'|'owner'|{email: string}} [options.audience='everyone']
 */
const sendNotification = async (userId, title, body, data = {}, { audience = 'everyone' } = {}) => {
  try {
    // ── 1. Fetch user and their device tokens ───────────────
    const user = await User.findById(userId).select('fcmTokens email name');

    if (!user) {
      console.warn(`[notification] User not found: ${userId}`);
      return;
    }

    // Keep a copy for the inbox first, so it's there even if no phone gets the push.
    await saveToInbox(user, title, body, data);

    if (!user.fcmTokens || user.fcmTokens.length === 0) {
      console.warn(`[notification] No devices registered for: ${user.email}`);
      return;
    }

    // ── 2. Filter — enabled devices that belong to the audience ─
    const enabledTokens = devicesFor(user, audience);

    if (enabledTokens.length === 0) {
      console.log(`[notification] No enabled devices for ${user.email} (audience: ${JSON.stringify(audience)}) — skipping`);
      return;
    }

    const webPath = WEB_PATHS[data.type];
    const dataPayload = Object.fromEntries(
      Object.entries({ ...(webPath && { url: webPath }), ...data }).map(([k, v]) => [k, String(v)])
    );
    const result = await deliverPush(enabledTokens, title, body, dataPayload);
    console.log(`[notification] Sent to ${user.email} — success: ${result.delivered}, failed: ${result.failed}`);
    const invalidTokens = result.invalidTokens;

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

const sendNotificationToMany = async (userIds, title, body, data = {}) => {
  await Promise.all(userIds.map(id => sendNotification(id, title, body, data)));
};

/** Same as sendNotification, but finds the account by the owner's email. Never throws. */
const notifyByEmail = async (ownerEmail, title, body, data = {}, options = {}) => {
  try {
    // Some accounts were saved with capital letters in the email, so match either way.
    const value = String(ownerEmail || '').trim();
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = value
      ? await User.findOne({ email: new RegExp(`^${escaped}$`, 'i') }).select('_id').lean()
      : null;
    if (user) await sendNotification(String(user._id), title, body, data, options);
  } catch (error) {
    console.error(`[notification] notifyByEmail failed for ${ownerEmail}:`, error.message);
  }
};

/**
 * Push to one person's own devices, whether they're an account owner or a team
 * member (whose devices are stored on the owner's account). Never throws.
 */
const notifyPerson = async (personEmail, title, body, data = {}) => {
  try {
    const email = String(personEmail || '').toLowerCase();
    const SubAdmin = require('../models/SubAdmin');
    const subAdmin = await SubAdmin.findOne({ email }).select('invitedBy').lean();
    const ownerEmail = subAdmin?.invitedBy || email;
    await notifyByEmail(ownerEmail, title, body, data, { audience: { email } });
  } catch (error) {
    console.error(`[notification] notifyPerson failed for ${personEmail}:`, error.message);
  }
};

module.exports = { sendNotification, sendNotificationToMany, notifyByEmail, notifyPerson, deliverPush, devicesFor, INBOX_TYPES };
