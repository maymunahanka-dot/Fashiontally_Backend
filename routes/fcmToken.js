/**
 * routes/fcmToken.js
 *
 * All routes are protected — require valid JWT.
 *
 * PUT    /api/user/fcm-token              — register a device token
 * PUT    /api/user/notifications/toggle   — enable/disable notifications for one device
 * DELETE /api/user/fcm-token              — remove a device token (on logout)
 * GET    /api/user/devices                — list all registered devices
 * POST   /api/user/test-notification      — send a test notification (debug)
 */

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  saveFcmToken,
  toggleDeviceNotification,
  removeFcmToken,
  listDevices,
} = require('../controllers/fcmTokenController');

// Register a new device or update existing
router.put('/fcm-token', verifyToken, saveFcmToken);

// Toggle notifications on/off for a specific device
router.put('/notifications/toggle', verifyToken, toggleDeviceNotification);

// Remove a device token (logout)
router.delete('/fcm-token', verifyToken, removeFcmToken);

// List all registered devices
router.get('/devices', verifyToken, listDevices);

module.exports = router;
