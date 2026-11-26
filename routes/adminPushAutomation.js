const express = require('express');
const router = express.Router();
const { verifyAdminToken } = require('../middleware/adminAuth');
const c = require('../controllers/adminPushAutomationController');

// Automated push notifications: /api/admin/push-automation
router.get('/', verifyAdminToken, c.getOverview);
router.put('/settings', verifyAdminToken, c.updateSettings);
router.put('/templates/:key/:lang', verifyAdminToken, c.saveTemplate);
router.delete('/templates/:key/:lang', verifyAdminToken, c.resetTemplate);
router.post('/preview', verifyAdminToken, c.preview);
router.post('/test', verifyAdminToken, c.sendTest);
router.get('/log', verifyAdminToken, c.getLog);
router.get('/upcoming', verifyAdminToken, c.getUpcoming);

module.exports = router;
