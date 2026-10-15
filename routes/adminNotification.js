const express = require('express');
const router  = express.Router();
const { sendBroadcast, getBroadcasts } = require('../controllers/adminNotificationController');
const { verifyAdminToken } = require('../middleware/adminAuth');
const { verifyToken }      = require('../middleware/auth');
const { runDailyNotifications } = require('../services/dailyNotifications.service');
const BroadcastNotification = require('../models/BroadcastNotification');

router.post('/send',            verifyAdminToken, sendBroadcast);
router.get('/',                 verifyAdminToken, getBroadcasts);

// ── Admin: delete a broadcast notification ──
router.delete('/:id', verifyAdminToken, async (req, res) => {
  try {
    const deleted = await BroadcastNotification.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('❌ Delete broadcast error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── User-facing: list broadcasts (requires regular user JWT) ──
// Only returns notifications sent AFTER the user's account was created.
// Each notification includes an `isRead` flag per user.
router.get('/user/list', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;

    // Get user's account creation date
    const User = require('../models/User');
    const user = await User.findOne({ email }).select('createdAt').lean();
    const accountCreatedAt = user?.createdAt ? new Date(user.createdAt) : new Date(0);

    const records = await BroadcastNotification.find({
      sentAt: { $gte: accountCreatedAt.toISOString() },
    })
      .sort({ sentAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: records.map(r => ({
        id:     r._id.toString(),
        title:  r.title,
        body:   r.body,
        sentAt: r.sentAt,
        isRead: (r.seenBy || []).includes(email),
      })),
    });
  } catch (error) {
    console.error('❌ Get user broadcasts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
  }
});

// ── User-facing: mark a notification as read ──
router.put('/user/read/:id', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { id } = req.params;

    await BroadcastNotification.updateOne(
      { _id: id },
      { $addToSet: { seenBy: email } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Mark read error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── User-facing: mark all as read ──
router.put('/user/read-all', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;

    const User = require('../models/User');
    const user = await User.findOne({ email }).select('createdAt').lean();
    const accountCreatedAt = user?.createdAt ? new Date(user.createdAt) : new Date(0);

    await BroadcastNotification.updateMany(
      { sentAt: { $gte: accountCreatedAt.toISOString() } },
      { $addToSet: { seenBy: email } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Mark all read error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/run-daily', verifyAdminToken, async (req, res) => {
  res.json({ success: true, message: 'Daily notification job triggered. Check server logs.' });
  runDailyNotifications().catch(err =>
    console.error('[daily] Manual trigger error:', err)
  );
});

module.exports = router;
