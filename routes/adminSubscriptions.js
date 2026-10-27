const express = require('express');
const router = express.Router();
const {
  getSubscriptions,
  grantTrial,
  cancelSubscription,
  recoverPayment,
} = require('../controllers/adminSubscriptionsController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.get('/list', verifyAdminToken, getSubscriptions);
router.post('/grant-trial', verifyAdminToken, grantTrial);
router.post('/cancel', verifyAdminToken, cancelSubscription);
router.post('/recover-payment', verifyAdminToken, recoverPayment);

module.exports = router;
