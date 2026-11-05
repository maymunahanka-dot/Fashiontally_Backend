/**
 * services/otpService.js
 *
 * Server-side OTP issuing and checking.
 *
 * Flow:
 *   1. issueOtp()  — throttles sends, generates a code, stores only its HMAC
 *   2. checkOtp()  — compares a submitted code, max attempts + expiry enforced
 *   3. createVerificationToken() — short-lived proof that an email was verified,
 *      which signup accepts as `emailVerificationToken`
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const OtpCode = require('../models/OtpCode');

const CODE_TTL_MINUTES   = 10;
const MAX_ATTEMPTS       = 5;
const RESEND_COOLDOWN_S  = 30;
const MAX_SENDS_PER_HOUR = 5;
const TOKEN_TTL          = '30m';
const TOKEN_PURPOSE      = 'email_verification';

const secret = () => process.env.OTP_SECRET || process.env.JWT_SECRET;
// Separate signing key so a verification token can never pass as a login token.
const tokenSecret = () => `${secret()}:${TOKEN_PURPOSE}`;

const generateCode = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');

const hashCode = (channel, target, code) =>
  crypto.createHmac('sha256', secret()).update(`${channel}:${target}:${code}`).digest('hex');

/**
 * Creates (or replaces) the active code for a target.
 * @returns {Promise<{ok: true, code: string} | {ok: false, status: number, message: string, retryAfter?: number}>}
 */
const issueOtp = async (channel, target) => {
  const now = new Date();
  const existing = await OtpCode.findOne({ channel, target });

  let sendCount = 1;
  let windowStart = now;
  if (existing) {
    const sinceLast = (now - existing.lastSentAt) / 1000;
    if (sinceLast < RESEND_COOLDOWN_S) {
      const retryAfter = Math.ceil(RESEND_COOLDOWN_S - sinceLast);
      return { ok: false, status: 429, retryAfter, message: `Please wait ${retryAfter}s before requesting another code.` };
    }
    const windowOpen = now - existing.windowStart < 60 * 60 * 1000;
    if (windowOpen) {
      if (existing.sendCount >= MAX_SENDS_PER_HOUR) {
        return { ok: false, status: 429, message: 'Too many codes requested. Please try again in an hour.' };
      }
      sendCount = existing.sendCount + 1;
      windowStart = existing.windowStart;
    }
  }

  const code = generateCode();
  await OtpCode.findOneAndUpdate(
    { channel, target },
    {
      codeHash:  hashCode(channel, target, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000),
      attempts:  0,
      lastSentAt: now,
      sendCount,
      windowStart,
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
  return { ok: true, code };
};

/** Lets a caller undo the send throttle when delivery failed, so the user can retry at once. */
const releaseOtp = (channel, target) => OtpCode.updateOne({ channel, target }, { lastSentAt: new Date(0) });

/**
 * @returns {Promise<{ok: true} | {ok: false, message: string, attemptsLeft?: number}>}
 */
const checkOtp = async (channel, target, code) => {
  const record = await OtpCode.findOne({ channel, target });
  if (!record || record.expiresAt < new Date()) {
    return { ok: false, message: 'This code has expired. Please request a new one.' };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, message: 'Too many incorrect attempts. Please request a new code.' };
  }

  const expected = Buffer.from(record.codeHash, 'hex');
  const actual   = Buffer.from(hashCode(channel, target, String(code).trim()), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    record.attempts += 1;
    await record.save();
    const attemptsLeft = MAX_ATTEMPTS - record.attempts;
    return {
      ok: false,
      attemptsLeft,
      message: attemptsLeft > 0
        ? `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`
        : 'Too many incorrect attempts. Please request a new code.',
    };
  }

  // Single use: the code can't be replayed, but keep the throttle counters.
  record.expiresAt = new Date(0);
  await record.save();
  return { ok: true };
};

const createVerificationToken = (email) =>
  jwt.sign({ email, purpose: TOKEN_PURPOSE }, tokenSecret(), { expiresIn: TOKEN_TTL });

/** @returns {boolean} true when the token proves `email` was verified recently. */
const isValidVerificationToken = (token, email) => {
  try {
    const payload = jwt.verify(token, tokenSecret());
    return payload.purpose === TOKEN_PURPOSE && payload.email === email;
  } catch {
    return false;
  }
};

module.exports = {
  CODE_TTL_MINUTES,
  issueOtp,
  releaseOtp,
  checkOtp,
  createVerificationToken,
  isValidVerificationToken,
};
