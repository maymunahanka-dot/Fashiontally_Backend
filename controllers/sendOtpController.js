const { sendWhatsAppOTP } = require('../services/whatsappService');

const sendOtp = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  try {
    const result = await sendWhatsAppOTP(phone);

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error || 'Failed to send OTP' });
    }

    // Return the OTP so the frontend can verify it client-side
    res.json({ success: true, message: 'OTP sent via WhatsApp', otp: result.otp });
  } catch (error) {
    console.error('❌ sendOtp error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

module.exports = { sendOtp };
