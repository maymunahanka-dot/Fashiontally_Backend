const express = require('express');
const router = express.Router();
const { sendEmailOtp, verifyEmailOtp } = require('../controllers/sendEmailOtpController');
const { otpSendLimiter, otpVerifyLimiter } = require('../middleware/rateLimiters');

router.post('/send-email-otp', otpSendLimiter, sendEmailOtp);
router.post('/verify-email-otp', otpVerifyLimiter, verifyEmailOtp);

module.exports = router;
