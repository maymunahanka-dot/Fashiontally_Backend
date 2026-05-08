const express = require('express');
const router = express.Router();
const { getSubscriptions, grantTrial, cancelSubscription } = require('../controllers/adminSubscriptionsController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.get('/list', verifyAdminToken, getSubscriptions);
router.post('/grant-trial', verifyAdminToken, grantTrial);
router.post('/cancel', verifyAdminToken, cancelSubscription);

module.exports = router;
