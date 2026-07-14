/**
 * forgotPasswordController.js  — no Firebase
 *
 * Flow:
 *   1. Validate email
 *   2. Check user exists in fashiontally_users
 *   3. Ensure AuthUser record exists in auth_users
 *   4. Generate secure token, store with 1-hour expiry in auth_users
 *   5. Send email with link to our own reset page
 */

const User = require('../models/User');
const AuthUser = require('../models/AuthUser');
const transporter = require('../config/mailtrap');
const { generateToken, tokenExpiry } = require('../utils/tokenUtils');

const forgotPassword = async (req, res) => {
  console.log('[forgotPassword] ── FORGOT PASSWORD ──────────────────');
  try {
    const { email } = req.body;

    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[forgotPassword] email: ${normalizedEmail}`);

    // ── Step 1: Check user profile ───────────────────────────
    console.log('[forgotPassword] Step 1: checking fashiontally_users');
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      console.warn(`[forgotPassword] No user profile: ${normalizedEmail}`);
      // Always return generic message — prevent email enumeration
      return res.json({ success: true, message: 'If this email exists, a reset link has been sent.' });
    }

    // ── Step 2: Find auth record ─────────────────────────────
    console.log('[forgotPassword] Step 2: checking auth_users');
    const authUser = await AuthUser.findOne({ email: normalizedEmail });
    if (!authUser) {
      console.warn(`[forgotPassword] No auth record: ${normalizedEmail}`);
      return res.json({ success: true, message: 'If this email exists, a reset link has been sent.' });
    }

    // ── Step 3: Generate token ───────────────────────────────
    console.log('[forgotPassword] Step 3: generating reset token');
    const token  = generateToken();
    const expiry = tokenExpiry(60);

    authUser.resetToken       = token;
    authUser.resetTokenExpiry = expiry;
    await authUser.save();
    console.log(`[forgotPassword] Token saved, expires: ${expiry.toISOString()}`);

    // ── Step 4: Build reset link ─────────────────────────────
    // Points to the backend GET /api/auth/reset-password?token=xxx
    // which serves an HTML form — no frontend dependency
    const backendBase = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const resetLink   = `${backendBase}/api/auth/reset-password?token=${token}`;
    console.log(`[forgotPassword] Reset link built`);

    // ── Step 5: Send email ───────────────────────────────────
    console.log('[forgotPassword] Step 5: sending email');
    await transporter.sendMail({
      from:    '"FashionTally" <no-reply@fashiontally.com>',
      to:      normalizedEmail,
      subject: 'Reset Your FashionTally Password',
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background: #16988d; padding: 32px 40px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FashionTally</h1>
          </div>
          <div style="padding: 40px;">
            <h2 style="color: #111827; font-size: 20px; margin: 0 0 12px 0;">Reset Your Password</h2>
            <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
              Hi ${user.name || 'there'},<br/><br/>
              We received a request to reset the password for your FashionTally account.
              Click the button below to choose a new password.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="background: #16988d; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 0;">
              This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
          <div style="background: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} FashionTally. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    console.log('[forgotPassword] Email sent ✅');
    res.json({ success: true, message: 'If this email exists, a reset link has been sent.' });

  } catch (error) {
    console.error('[forgotPassword] Error:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Failed to send reset email. Please try again.' });
  }
};

module.exports = { forgotPassword };
