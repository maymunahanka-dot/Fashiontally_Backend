const { rateLimit } = require('express-rate-limit');

/**
 * Client IP for rate limiting. Behind a proxy every request would share the proxy's
 * address, so prefer the first X-Forwarded-For entry. A spoofed header only escapes
 * this per-IP limit; the per-email/per-phone throttling in otpService still applies.
 */
const clientKey = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip;
};

const limiter = ({ windowMinutes, max, message, keyGenerator = clientKey }) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  limit: max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false },
  handler: (req, res) => res.status(429).json({ success: false, message }),
});

/** Sending verification codes, per client. */
const otpSendLimiter = limiter({
  windowMinutes: 15,
  max: 10,
  message: 'Too many code requests from this device. Please try again later.',
});

/** Checking verification codes, per client. */
const otpVerifyLimiter = limiter({
  windowMinutes: 15,
  max: 30,
  message: 'Too many verification attempts. Please try again later.',
});

/**
 * WhatsApp OTP has no app using it yet and every message costs money,
 * so it also gets a small cap shared by all callers.
 */
const whatsappOtpGlobalLimiter = limiter({
  windowMinutes: 60,
  max: 50,
  keyGenerator: () => 'whatsapp-otp',
  message: 'WhatsApp verification is temporarily unavailable. Please try again later.',
});

module.exports = { otpSendLimiter, otpVerifyLimiter, whatsappOtpGlobalLimiter };
