const express = require('express');
const router  = express.Router();
const { sendBroadcast, getBroadcasts } = require('../controllers/adminNotificationController');
const { verifyAdminToken } = require('../middleware/adminAuth');
const { verifyToken }      = require('../middleware/auth');
const { runDailyNotifications } = require('../services/dailyNotifications.service');
const BroadcastNotification = require('../models/BroadcastNotification');
const UserNotification = require('../models/UserNotification');

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

/** The signed-in person's own inbox items (payment & plan notices), matched without caring about capitals. */
const ownInbox = (email) => ({
  email: new RegExp(`^${String(email || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
});

const accountCreatedAt = async (email) => {
  const User = require('../models/User');
  const user = await User.findOne({ email }).select('createdAt').lean();
  return user?.createdAt ? new Date(user.createdAt) : new Date(0);
};

// ── User-facing: the inbox (requires regular user JWT) ──
// Admin broadcasts sent after the account was created, plus the person's own
// payment & plan notifications, newest first. Each has an `isRead` flag and a
// `type` ('broadcast', 'payment_success', 'plan_ending', ...).
router.get('/user/list', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const since = await accountCreatedAt(email);

    const [broadcasts, personal] = await Promise.all([
      BroadcastNotification.find({ sentAt: { $gte: since.toISOString() } }).sort({ sentAt: -1 }).limit(50).lean(),
      UserNotification.find(ownInbox(email)).sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    const items = [
      ...broadcasts.map((r) => ({
        id:     r._id.toString(),
        type:   'broadcast',
        title:  r.title,
        body:   r.body,
        sentAt: r.sentAt,
        isRead: (r.seenBy || []).includes(email),
      })),
      ...personal.map((n) => ({
        id:     n._id.toString(),
        type:   n.type,
        title:  n.title,
        body:   n.body,
        url:    n.url,
        sentAt: new Date(n.createdAt).toISOString(),
        isRead: Boolean(n.isRead),
      })),
    ]
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      .slice(0, 50);

    res.json({ success: true, data: items });
  } catch (error) {
    console.error('❌ Get user notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
  }
});

// ── User-facing: mark one notification as read (personal or broadcast) ──
router.put('/user/read/:id', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { id } = req.params;

    const personal = await UserNotification.updateOne({ _id: id, ...ownInbox(email) }, { $set: { isRead: true } });
    if (!personal.matchedCount) {
      await BroadcastNotification.updateOne({ _id: id }, { $addToSet: { seenBy: email } });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Mark read error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── User-facing: mark everything as read ──
router.put('/user/read-all', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const since = await accountCreatedAt(email);

    await Promise.all([
      BroadcastNotification.updateMany({ sentAt: { $gte: since.toISOString() } }, { $addToSet: { seenBy: email } }),
      UserNotification.updateMany({ ...ownInbox(email), isRead: false }, { $set: { isRead: true } }),
    ]);

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
