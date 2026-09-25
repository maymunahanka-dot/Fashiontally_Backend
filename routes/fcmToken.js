

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
