const { sendEmailOTP } = require('../services/emailService');
const {
  CODE_TTL_MINUTES,
  issueOtp,
  releaseOtp,
  checkOtp,
  createVerificationToken,
} = require('../services/otpService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Apps that verify on the server send `flow: "server"`. Older app versions don't,
 * and still compare the code on the device, so they get it back in the response.
 * Set LEGACY_OTP_RESPONSES=false once old versions are blocked to stop that.
 */
const isLegacyClient = (req) =>
  req.body?.flow !== 'server' && process.env.LEGACY_OTP_RESPONSES !== 'false';

const sendEmailOtp = async (req, res) => {
  const { email } = req.body;

  if (!email || !String(email).trim()) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }

  if (!EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ success: false, message: 'Invalid email address' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const issued = await issueOtp('email', normalizedEmail);
    if (!issued.ok) {
      return res.status(issued.status).json({ success: false, message: issued.message, retryAfter: issued.retryAfter });
    }

    const result = await sendEmailOTP(normalizedEmail, issued.code, CODE_TTL_MINUTES);
    if (!result.success) {
      await releaseOtp('email', normalizedEmail);
      return res.status(500).json({ success: false, message: result.error || 'Failed to send OTP' });
    }

    if (isLegacyClient(req)) {
      console.warn('[sendEmailOtp] legacy client — returning code in response');
      return res.json({ success: true, message: 'OTP sent via email', otp: issued.code });
    }
    res.json({ success: true, message: 'OTP sent via email', expiresInMinutes: CODE_TTL_MINUTES });
  } catch (error) {
    console.error('❌ sendEmailOtp error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

/**
 * Checks a code sent by sendEmailOtp. On success returns a short-lived
 * `verificationToken` that signup accepts as `emailVerificationToken`.
 */
const verifyEmailOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ success: false, message: 'Valid email address is required' });
  }
  if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
    return res.status(400).json({ success: false, message: 'Enter the 6-digit code' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const result = await checkOtp('email', normalizedEmail, otp);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message, attemptsLeft: result.attemptsLeft });
    }
    res.json({ success: true, verificationToken: createVerificationToken(normalizedEmail) });
  } catch (error) {
    console.error('❌ verifyEmailOtp error:', error.message);
    res.status(500).json({ success: false, message: 'Could not verify the code. Please try again.' });
  }
};

module.exports = { sendEmailOtp, verifyEmailOtp, isLegacyClient };
