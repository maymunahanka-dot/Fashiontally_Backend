const { admin } = require('../server');
const User = require('../models/User');
const transporter = require('../config/mailtrap');

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check user exists in MongoDB
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ success: false, error: 'No account found with this email address.' });
    }

    // Generate reset link via Firebase Admin
    const resetLink = await admin.auth().generatePasswordResetLink(normalizedEmail);

    // Send custom email via Mailtrap
    await transporter.sendMail({
      from: '"FashionTally" <no-reply@fashiontally.com>',
      to: normalizedEmail,
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
              This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will not change.
            </p>
          </div>
          <div style="background: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} FashionTally. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    res.json({ success: true, message: 'If this email exists, a reset link has been sent.' });

  } catch (error) {
    console.error('❌ Forgot password error:', error);

    // Firebase error: user not found in Firebase Auth
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ success: false, error: 'No account found with this email address.' });
    }

    res.status(500).json({ success: false, error: 'Failed to send reset email. Please try again.' });
  }
};

module.exports = { forgotPassword };
