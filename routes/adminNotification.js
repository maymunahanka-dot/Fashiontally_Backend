const express = require('express');
const router  = express.Router();
const { sendBroadcast, getBroadcasts } = require('../controllers/adminNotificationController');
const { verifyAdminToken } = require('../middleware/adminAuth');
const { runDailyNotifications } = require('../services/dailyNotifications.service');

router.post('/send',            verifyAdminToken, sendBroadcast);
router.get('/',                 verifyAdminToken, getBroadcasts);

// Manual trigger — POST /api/admin/notifications/run-daily
// Useful for testing without waiting for the cron schedule
router.post('/run-daily', verifyAdminToken, async (req, res) => {
  res.json({ success: true, message: 'Daily notification job triggered. Check server logs.' });
  // Run after response so the request doesn't time out
  runDailyNotifications().catch(err =>
    console.error('[daily] Manual trigger error:', err)
  );
});

module.exports = router;
