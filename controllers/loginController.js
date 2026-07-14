/**
 * loginController.js  — no Firebase
 *
 * Flow:
 *   1. Validate input
 *   2. Find AuthUser in auth_users (MongoDB)
 *   3. Verify password — bcrypt OR Firebase scrypt (legacy)
 *   4. On scrypt success → migrate to bcrypt in background
 *   5. Find User profile or SubAdmin profile
 *   6. Sign and return JWT
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuthUser = require('../models/AuthUser');
const SubAdmin = require('../models/SubAdmin');
const { verifyPassword, migrateTobcrypt } = require('../utils/passwordUtils');
const { sendNotification } = require('../services/notification.service');

const loginUser = async (req, res) => {
  console.log('[login] ── LOGIN ATTEMPT ──────────────────────────────');
  const { email, password } = req.body || {};

  if (!email || !String(email).trim()) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }
  if (!password || !String(password).trim()) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log(`[login] email: ${normalizedEmail}`);

  try {
    // ── Step 1: Find auth record ─────────────────────────────
    console.log('[login] Step 1: looking up auth_users');
    const authUser = await AuthUser.findOne({ email: normalizedEmail });

    if (!authUser) {
      console.warn(`[login] No auth record: ${normalizedEmail}`);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    console.log(`[login] Auth record found — hasBcrypt: ${!!authUser.bcryptHash}, hasFirebase: ${!!(authUser.passwordHash && authUser.passwordSalt)}, provider: ${authUser.provider}`);

    if (authUser.disabled) {
      return res.status(403).json({ success: false, error: 'Account has been disabled' });
    }

    // Google-only account — no password stored at all
    if (authUser.provider === 'google' && !authUser.bcryptHash && !authUser.passwordHash) {
      console.warn(`[login] Google-only account tried email login: ${normalizedEmail}`);
      return res.status(401).json({ success: false, error: 'This account uses Google Sign-In. Please click "Continue with Google" to log in.' });
    }

    // ── Step 2: Verify password ──────────────────────────────
    console.log('[login] Step 2: verifying password');
    const { valid, needsMigration } = await verifyPassword(password, authUser);

    if (!valid) {
      console.warn(`[login] Password failed for: ${normalizedEmail}`);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    console.log(`[login] Password ok ✅  needsMigration: ${needsMigration}`);

    // ── Step 3: Migrate scrypt → bcrypt (fire and forget) ────
    if (needsMigration) {
      migrateTobcrypt(authUser, password).catch(() => {});
    }

    // ── Step 4: Regular user ─────────────────────────────────
    console.log('[login] Step 4: looking up user profile');
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      const token = jwt.sign(
        { uid: authUser.firebaseUid || authUser._id.toString(), email: normalizedEmail },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      console.log('[login] Regular user — success ✅');
      // Fire-and-forget — does not delay the login response
      sendNotification(
        user._id,
        'Login Successful',
        'You just logged into your account.',
        { type: 'login' }
      ).catch(() => {});
      return res.json({ success: true, token, user });
    }

    // ── Step 5: SubAdmin ─────────────────────────────────────
    console.log('[login] Step 5: checking SubAdmin');
    const subAdmin = await SubAdmin.findOne({ email: normalizedEmail });

    if (subAdmin) {
      const ownerEmail = subAdmin.invitedBy.toLowerCase();
      const ownerUser  = await User.findOne({ email: ownerEmail });

      if (!ownerUser) {
        console.error(`[login] SubAdmin owner not found: ${ownerEmail}`);
        return res.status(404).json({ success: false, error: 'Owner account not found' });
      }

      const token = jwt.sign(
        { uid: authUser.firebaseUid || authUser._id.toString(), email: normalizedEmail },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const subAdminData = {
        ...subAdmin.toObject(),
        uid: authUser.firebaseUid || authUser._id.toString(),
        isSubAdmin: true,
        isAdmin: true,
        ownerEmail,
        subscriptionType:    ownerUser.subscriptionType,
        isTrialActive:       ownerUser.isTrialActive,
        planType:            ownerUser.planType,
        subscriptionEndDate: ownerUser.subscriptionEndDate,
        isSubscribed:        ownerUser.isSubscribed,
      };

      console.log('[login] SubAdmin — success ✅');
      return res.json({ success: true, token, user: subAdminData });
    }

    console.warn(`[login] Auth record exists but no profile for: ${normalizedEmail}`);
    return res.status(404).json({ success: false, error: 'User not found' });

  } catch (error) {
    console.error('[login] Error:', error.message, error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { loginUser };
