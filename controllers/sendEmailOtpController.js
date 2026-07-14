const { sendEmailOTP } = require('../services/emailService');

const sendEmailOtp = async (req, res) => {
  const { email } = req.body;

  if (!email || !String(email).trim()) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(String(email).trim())) {
    return res.status(400).json({ success: false, message: 'Invalid email address' });
  }

  try {
    const result = await sendEmailOTP(email.trim().toLowerCase());

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error || 'Failed to send OTP' });
    }

    // Return the OTP so the frontend can verify it client-side (same pattern as WhatsApp OTP)
    res.json({ success: true, message: 'OTP sent via email', otp: result.otp });
  } catch (error) {
    console.error('❌ sendEmailOtp error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

module.exports = { sendEmailOtp };
