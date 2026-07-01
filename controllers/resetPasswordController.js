/**
 * resetPasswordController.js  — no Firebase
 *
 * GET  /api/auth/reset-password?token=xxx
 *   → Serves an HTML form for the user to enter their new password
 *
 * POST /api/auth/reset-password
 *   Body: { token, newPassword, confirmPassword }  (from HTML form)
 *   → Validates, hashes with bcrypt, saves, returns HTML success/error page
 */

const AuthUser = require('../models/AuthUser');
const { hashPassword } = require('../utils/passwordUtils');

// ── Shared HTML shell ─────────────────────────────────────────
const htmlShell = (title, bodyContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — FashionTally</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f3f4f6;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 40px 36px;
      width: 100%;
      max-width: 420px;
    }
    .logo {
      text-align: center;
      margin-bottom: 28px;
    }
    .logo span {
      font-size: 22px;
      font-weight: 700;
      color: #16988d;
      letter-spacing: -0.5px;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
      text-align: center;
    }
    p.sub {
      font-size: 14px;
      color: #6b7280;
      text-align: center;
      margin-bottom: 28px;
      line-height: 1.6;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
      margin-top: 16px;
    }
    input[type="password"] {
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid #d1d5db;
      border-radius: 8px;
      font-size: 15px;
      color: #111827;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus { border-color: #16988d; }
    button[type="submit"] {
      width: 100%;
      margin-top: 24px;
      padding: 13px;
      background: #16988d;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button[type="submit"]:hover { background: #0e7a71; }
    .alert {
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 20px;
      line-height: 1.5;
    }
    .alert-error   { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; }
    .alert-success { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
    .login-link {
      display: block;
      text-align: center;
      margin-top: 20px;
      font-size: 14px;
      color: #16988d;
      text-decoration: none;
      font-weight: 600;
    }
    .login-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><span>FashionTally</span></div>
    ${bodyContent}
  </div>
</body>
</html>`;

// ── GET — serve the reset form ────────────────────────────────
const getResetPasswordPage = async (req, res) => {
  console.log('[resetPassword] GET /api/auth/reset-password');
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(htmlShell('Invalid Link', `
      <h1>Invalid Link</h1>
      <p class="sub">This password reset link is missing a token.</p>
      <div class="alert alert-error">Please request a new password reset link.</div>
    `));
  }

  // Check token is valid before showing the form
  const authUser = await AuthUser.findOne({ resetToken: token }).catch(() => null);

  if (!authUser) {
    return res.status(400).send(htmlShell('Invalid Link', `
      <h1>Link Invalid or Expired</h1>
      <p class="sub">This password reset link is no longer valid.</p>
      <div class="alert alert-error">Please request a new password reset link.</div>
    `));
  }

  if (!authUser.resetTokenExpiry || new Date() > authUser.resetTokenExpiry) {
    return res.status(400).send(htmlShell('Link Expired', `
      <h1>Link Expired</h1>
      <p class="sub">This password reset link has expired (valid for 1 hour).</p>
      <div class="alert alert-error">Please request a new password reset link.</div>
    `));
  }

  // Serve the form
  res.send(htmlShell('Reset Password', `
    <h1>Reset Your Password</h1>
    <p class="sub">Enter a new password for <strong>${authUser.email}</strong></p>
    <form method="POST" action="/api/auth/reset-password">
      <input type="hidden" name="token" value="${token}"/>
      <label for="newPassword">New Password</label>
      <input type="password" id="newPassword" name="newPassword" placeholder="At least 6 characters" required minlength="6"/>
      <label for="confirmPassword">Confirm Password</label>
      <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Repeat your new password" required minlength="6"/>
      <button type="submit">Set New Password</button>
    </form>
  `));
};

// ── POST — process the form submission ────────────────────────
const resetPassword = async (req, res) => {
  console.log('[resetPassword] POST /api/auth/reset-password');
  try {
    // Supports both JSON (API calls) and form submission (HTML form)
    const token           = req.body.token;
    const newPassword     = req.body.newPassword;
    const confirmPassword = req.body.confirmPassword;
    const isJson          = req.headers['content-type']?.includes('application/json');

    const sendError = (status, message) => {
      if (isJson) return res.status(status).json({ success: false, error: message });
      return res.status(status).send(htmlShell('Error', `
        <h1>Reset Failed</h1>
        <div class="alert alert-error">${message}</div>
        <a class="login-link" href="javascript:history.back()">← Try again</a>
      `));
    };

    if (!token)       return sendError(400, 'Reset token is missing.');
    if (!newPassword) return sendError(400, 'New password is required.');
    if (newPassword.length < 6) return sendError(400, 'Password must be at least 6 characters.');
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return sendError(400, 'Passwords do not match.');
    }

    console.log(`[resetPassword] token prefix: ${token.substring(0, 10)}...`);

    const authUser = await AuthUser.findOne({ resetToken: token });
    if (!authUser) {
      console.warn('[resetPassword] Token not found');
      return sendError(400, 'Invalid or expired reset token. Please request a new one.');
    }

    if (!authUser.resetTokenExpiry || new Date() > authUser.resetTokenExpiry) {
      console.warn(`[resetPassword] Token expired for: ${authUser.email}`);
      return sendError(400, 'Reset token has expired. Please request a new password reset.');
    }

    console.log(`[resetPassword] Resetting password for: ${authUser.email}`);
    authUser.bcryptHash            = await hashPassword(newPassword);
    authUser.passwordHash          = null;
    authUser.passwordSalt          = null;
    authUser.resetToken            = null;
    authUser.resetTokenExpiry      = null;
    authUser.requiresPasswordReset = false;
    await authUser.save();

    console.log(`[resetPassword] Password reset for: ${authUser.email} ✅`);

    if (isJson) {
      return res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
    }

    // Redirect to a success page (served by backend)
    const appUrl = process.env.FRONTEND_APP_URL || 'https://app.fashiontally.com';
    res.send(htmlShell('Password Reset', `
      <h1>Password Reset!</h1>
      <div class="alert alert-success">
        Your password has been reset successfully.
      </div>
      <p class="sub">You can now log in with your new password.</p>
      <a class="login-link" href="${appUrl}/login">Go to Login →</a>
    `));

  } catch (error) {
    console.error('[resetPassword] Error:', error.message, error.stack);
    const isJson = req.headers['content-type']?.includes('application/json');
    if (isJson) return res.status(500).json({ success: false, error: 'Failed to reset password.' });
    res.status(500).send(htmlShell('Error', `
      <h1>Something went wrong</h1>
      <div class="alert alert-error">Failed to reset password. Please try again.</div>
    `));
  }
};

module.exports = { getResetPasswordPage, resetPassword };
