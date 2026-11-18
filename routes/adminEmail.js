const express = require('express');
const router = express.Router();
const { verifyAdminToken } = require('../middleware/adminAuth');
const c = require('../controllers/adminEmailController');

// Admin email campaigns: /api/admin/emails
router.get('/audience', verifyAdminToken, c.getAudience);
router.get('/quota', verifyAdminToken, c.getQuota);
router.post('/preview', verifyAdminToken, c.previewEmail);
router.post('/test', verifyAdminToken, c.sendTest);
router.get('/', verifyAdminToken, c.listCampaigns);
router.post('/', verifyAdminToken, c.createCampaign);
router.get('/:id', verifyAdminToken, c.getCampaign);
router.post('/:id/cancel', verifyAdminToken, c.cancelCampaign);
router.post('/:id/retry', verifyAdminToken, c.retryFailed);
router.delete('/:id', verifyAdminToken, c.deleteCampaign);

module.exports = router;
