
const User = require('../models/User');

// ── Register / update a device token ─────────────────────────────────────────
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

    const email       = req.effectiveEmail;
    const cleanToken  = token.trim();
    const cleanPlatform = platform || 'web';
    const cleanDevice = typeof deviceName === 'string' ? deviceName.trim() : '';

    const user = await User.findOne({ email }).select('_id');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Match same token OR same device name+platform (re-login on same device)
    const match = cleanDevice
      ? { $or: [{ token: cleanToken }, { deviceName: cleanDevice, platform: cleanPlatform }] }
      : { token: cleanToken };

    const existing = await User.findOne({ email, fcmTokens: { $elemMatch: match } }).select('fcmTokens');

    if (existing) {
      const matches = (existing.fcmTokens || []).filter((d) =>
        d.token === cleanToken ||
        (cleanDevice && (d.deviceName || '') === cleanDevice && (d.platform || 'web') === cleanPlatform)
      );
      const keep = matches.find((d) => d.token === cleanToken) || matches[0];

      await User.updateOne({ email }, { $pull: { fcmTokens: match } });
      await User.updateOne(
        { email },
        {
          $push: {
            fcmTokens: {
              token:      cleanToken,
              platform:   cleanPlatform,
              deviceName: cleanDevice,
              addedAt:    keep?.addedAt || new Date().toISOString(),
              enabled:    keep?.enabled !== false,
            },
          },
        }
      );
      console.log(`[fcmToken] Token already exists, updated metadata for: ${email}`);
      return res.json({ success: true, message: 'Device token updated' });
    }

    const inserted = await User.updateOne(
      { email, fcmTokens: { $not: { $elemMatch: match } } },
      {
        $push: {
          fcmTokens: {
            token:      cleanToken,
            platform:   cleanPlatform,
            deviceName: cleanDevice,
            addedAt:    new Date().toISOString(),
            enabled:    true,
          },
        },
      }
    );

    if (inserted.matchedCount === 0) {
      console.log(`[fcmToken] Token already exists, skipped for: ${email}`);
      return res.json({ success: true, message: 'Device token updated' });
    }

    console.log(`[fcmToken] ✅ New device registered for: ${email} (${cleanPlatform})`);
    res.json({ success: true, message: 'Device registered successfully' });

  } catch (error) {
    console.error('[fcmToken] ❌ Error saving token:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Toggle notifications for a specific device ────────────────────────────────
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
    res.json({ success: true, message: `Notifications ${status} for this device`, enabled });

  } catch (error) {
    console.error('[notifications] ❌ Error toggling device notification:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Remove a device token (on logout) ────────────────────────────────────────
const removeFcmToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'token is required' });
    }

    const email = req.effectiveEmail;
    await User.updateOne({ email }, { $pull: { fcmTokens: { token: token.trim() } } });

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

    const devices = (user.fcmTokens || []).map((d, idx) => ({
      index:        idx,
      platform:     d.platform,
      deviceName:   d.deviceName,
      addedAt:      d.addedAt,
      enabled:      d.enabled,
      tokenPreview: d.token ? `${d.token.slice(0, 10)}...` : '',
      token:        d.token,
    }));

    res.json({ success: true, data: devices });

  } catch (error) {
    console.error('[devices] ❌ Error listing devices:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { saveFcmToken, toggleDeviceNotification, removeFcmToken, listDevices };
