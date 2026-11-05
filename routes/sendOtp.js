const express = require('express');
const router = express.Router();
const { sendOtp } = require('../controllers/sendOtpController');
const { otpSendLimiter, whatsappOtpGlobalLimiter } = require('../middleware/rateLimiters');

router.post('/send-otp', whatsappOtpGlobalLimiter, otpSendLimiter, sendOtp);

module.exports = router;
