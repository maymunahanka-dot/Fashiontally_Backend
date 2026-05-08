const express = require('express');
const router = express.Router();
const { getContactMessages, markContactSeen, getDemoRequests, markDemoSeen } = require('../controllers/adminInboxController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.get('/contacts', verifyAdminToken, getContactMessages);
router.put('/contacts/:id/seen', verifyAdminToken, markContactSeen);
router.get('/demos', verifyAdminToken, getDemoRequests);
router.put('/demos/:id/seen', verifyAdminToken, markDemoSeen);

module.exports = router;
