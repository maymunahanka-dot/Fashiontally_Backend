const express = require('express');
const router = express.Router();
const {
  createPayment,
  deletePayment,
  editPayment,
  getPayment,
  getPaymentByEmail,
  verifyFlutterwavePayment,
  flutterwavePaymentStatus,
  flutterwaveWebhook,
} = require('../controllers/paymentController');
const { verifyToken, optionalVerifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createPayment);
router.delete('/delete/:id', verifyToken, deletePayment);
router.put('/edit/:id', verifyToken, editPayment);
router.get('/get/:id', verifyToken, getPayment);
router.get('/list', verifyToken, getPaymentByEmail);
router.get('/get-by-email/:email', verifyToken, getPaymentByEmail);

// Browser callback — activates on completed/successful even if secret/API fails
router.post('/flutterwave/verify', optionalVerifyToken, verifyFlutterwavePayment);
// 2) Poll while waiting for webhook if callback was cut off
router.get('/flutterwave/status', flutterwavePaymentStatus);
// 3) Flutterwave webhook — activates even if the user never returns to the site
router.post('/flutterwave/webhook', flutterwaveWebhook);

module.exports = router;
