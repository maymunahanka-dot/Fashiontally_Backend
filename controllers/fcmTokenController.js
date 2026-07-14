/**
 * controllers/fcmTokenController.js
 *
 * Handles all FCM device token operations for the authenticated user.
 *
 * Routes:
 *   PUT    /api/user/fcm-token              — register a device
 *   PUT    /api/user/notifications/toggle   — enable/disable one device
 *   DELETE /api/user/fcm-token              — remove a device (logout)
 *   GET    /api/user/devices                — list all registered devices
 */

const User = require('../models/User');

// ── Register / update a device token ─────────────────────────────────────────
// Called by the app right after login to add this device to the user's list.
// If the token already exists it is skipped (no duplicates).
const saveFcmToken = async (req, res) => {
  try {
    const { token, platform, deviceName } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'token is required' });
    }

    const validPlatforms = ['ios', 'android', 'web'];
    if (platform && !validPlatforms.includes(platform)) {
      return res.status(400).json({ success: false, error: 'platform must be ios, android, or web' });
    }

    const email = req.effectiveEmail;

    // Check if this exact token already exists for this user
    const existing = await User.findOne({ email, 'fcmTokens.token': token.trim() });

    if (existing) {
      // Token already registered — just update deviceName/platform in case they changed
      await User.updateOne(
        { email, 'fcmTokens.token': token.trim() },
        {
          $set: {
            'fcmTokens.$.platform':   platform   || 'web',
            'fcmTokens.$.deviceName': deviceName || '',
          }
        }
      );
      console.log(`[fcmToken] Token already exists, updated metadata for: ${email}`);
      return res.json({ success: true, message: 'Device token updated' });
    }

    // New token — push it into the array
    await User.updateOne(
      { email },
      {
        $push: {
          fcmTokens: {
            token:      token.trim(),
            platform:   platform   || 'web',
            deviceName: deviceName || '',
            addedAt:    new Date().toISOString(),
            enabled:    true,
          }
        }
      }
    );

    console.log(`[fcmToken] ✅ New device registered for: ${email} (${platform || 'web'})`);
    res.json({ success: true, message: 'Device registered successfully' });

  } catch (error) {
    console.error('[fcmToken] ❌ Error saving token:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Toggle notifications for a specific device ────────────────────────────────
// Body: { token: "device_token", enabled: true | false }
const toggleDeviceNotification = async (req, res) => {
  try {
    const { token, enabled } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'token is required' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: '"enabled" must be a boolean (true or false)' });
    }

    const email = req.effectiveEmail;

    const result = await User.updateOne(
      { email, 'fcmTokens.token': token.trim() },
      { $set: { 'fcmTokens.$.enabled': enabled } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Device token not found for this user' });
    }

    const status = enabled ? 'enabled' : 'disabled';
    console.log(`[notifications] ✅ Notifications ${status} for device token of: ${email}`);

    res.json({
      success: true,
      message: `Notifications ${status} for this device`,
      enabled,
    });

  } catch (error) {
    console.error('[notifications] ❌ Error toggling device notification:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Remove a device token (on logout) ────────────────────────────────────────
// Body: { token: "device_token" }
const removeFcmToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'token is required' });
    }

    const email = req.effectiveEmail;

    await User.updateOne(
      { email },
      { $pull: { fcmTokens: { token: token.trim() } } }
    );

    console.log(`[fcmToken] ✅ Device removed for: ${email}`);
    res.json({ success: true, message: 'Device removed successfully' });

  } catch (error) {
    console.error('[fcmToken] ❌ Error removing token:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── List all registered devices for the user ─────────────────────────────────
const listDevices = async (req, res) => {
  try {
    const email = req.effectiveEmail;

    const user = await User.findOne({ email }).select('fcmTokens');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Return device info but NOT the raw token string (security)
    const devices = (user.fcmTokens || []).map((d, idx) => ({
      index:      idx,
      platform:   d.platform,
      deviceName: d.deviceName,
      addedAt:    d.addedAt,
      enabled:    d.enabled,
      // Return a partial token so the frontend can identify which to toggle/remove
      tokenPreview: d.token ? `${d.token.slice(0, 10)}...` : '',
      // Full token needed for toggle/remove calls
      token: d.token,
    }));

    res.json({ success: true, data: devices });

  } catch (error) {
    console.error('[devices] ❌ Error listing devices:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { saveFcmToken, toggleDeviceNotification, removeFcmToken, listDevices };
