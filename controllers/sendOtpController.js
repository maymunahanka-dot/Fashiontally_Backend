const { sendWhatsAppOTP } = require('../services/whatsappService');
const { issueOtp, releaseOtp } = require('../services/otpService');
const { isLegacyClient } = require('./sendEmailOtpController');

const sendOtp = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  const target = String(phone).replace(/[^\d+]/g, '');

  try {
    const issued = await issueOtp('whatsapp', target);
    if (!issued.ok) {
      return res.status(issued.status).json({ success: false, message: issued.message, retryAfter: issued.retryAfter });
    }

    const result = await sendWhatsAppOTP(phone, issued.code);
    if (!result.success) {
      await releaseOtp('whatsapp', target);
      return res.status(500).json({ success: false, message: result.error || 'Failed to send OTP' });
    }

    // Older clients compared the code on the device; see isLegacyClient.
    if (isLegacyClient(req)) {
      return res.json({ success: true, message: 'OTP sent via WhatsApp', otp: issued.code });
    }
    res.json({ success: true, message: 'OTP sent via WhatsApp' });
  } catch (error) {
    console.error('❌ sendOtp error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

module.exports = { sendOtp };
