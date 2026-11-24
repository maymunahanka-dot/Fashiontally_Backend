const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { verifyToken } = require('../middleware/auth');
const { verifyAdminToken } = require('../middleware/adminAuth');
const c = require('../controllers/referralController');
const a = require('../controllers/adminReferralController');

const publicLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: c.clientIp,
  handler: (req, res) => res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' }),
});

// Users: /api/referral
const user = express.Router();
user.get('/check/:code', publicLimiter, c.checkCode);
user.post('/click', publicLimiter, c.click);
user.get('/me', verifyToken, c.getMine);
user.put('/bank', verifyToken, c.saveBank);
user.post('/payout', verifyToken, c.requestPayout);

// Admin: /api/admin/referrals
const admin = express.Router();
admin.use(verifyAdminToken);
admin.get('/overview', a.overview);
admin.get('/participants', a.participants);
admin.post('/participants/:email/suspend', a.suspend);
admin.get('/referrals', a.referrals);
admin.post('/referrals/:id/reverse', a.reverse);
admin.get('/payouts', a.payouts);
admin.post('/payouts/:id/:action', a.payoutAction);
admin.put('/settings', a.updateSettings);
admin.get('/export', a.exportCsv);

module.exports = { user, admin };
