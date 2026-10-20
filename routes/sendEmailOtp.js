const express = require('express');
const router = express.Router();
const { sendEmailOtp } = require('../controllers/sendEmailOtpController');

router.post('/send-email-otp', sendEmailOtp);

module.exports = router;
