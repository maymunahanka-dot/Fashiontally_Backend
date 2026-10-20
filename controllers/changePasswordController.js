/**
 * changePasswordController.js  — no Firebase
 *
 * PUT /api/auth/change-password  (JWT protected)
 * Body: { currentPassword, newPassword }
 *
 * Flow:
 *   1. Validate inputs
 *   2. Find AuthUser by email from JWT
 *   3. Verify current password (bcrypt OR Firebase scrypt)
 *   4. Hash new password with bcrypt
 *   5. Save — clears any Firebase scrypt fields
 */

const AuthUser = require('../models/AuthUser');
const { verifyPassword, hashPassword } = require('../utils/passwordUtils');

const changePassword = async (req, res) => {
  console.log('[changePassword] ── CHANGE PASSWORD ───────────────────');
  try {
    const { currentPassword, newPassword } = req.body;
    const email = req.user.email; // from verifyToken middleware

    console.log(`[changePassword] email: ${email}`);

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, error: 'New password must be different from current password' });
    }

    // ── Step 1: Find auth record ───────────────────────────────
    console.log('[changePassword] Step 1: looking up auth_users');
    const authUser = await AuthUser.findOne({ email });

    if (!authUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`[changePassword] hasBcrypt: ${!!authUser.bcryptHash}, hasFirebase: ${!!(authUser.passwordHash && authUser.passwordSalt)}`);

    // ── Step 2: Verify current password ───────────────────────
    console.log('[changePassword] Step 2: verifying current password');
    const { valid } = await verifyPassword(currentPassword, authUser);

    if (!valid) {
      console.warn(`[changePassword] Current password wrong for: ${email}`);
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    console.log('[changePassword] Current password verified ✅');

    // ── Step 3: Hash + save new password ──────────────────────
    console.log('[changePassword] Step 3: saving new password');
    authUser.bcryptHash            = await hashPassword(newPassword);
    authUser.passwordHash          = null;  // clear Firebase scrypt
    authUser.passwordSalt          = null;
    authUser.requiresPasswordReset = false;
    await authUser.save();

    console.log(`[changePassword] Password changed for: ${email} ✅`);
    res.json({ success: true, message: 'Password updated successfully' });

  } catch (error) {
    console.error('[changePassword] Error:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Failed to update password' });
  }
};

module.exports = { changePassword };
