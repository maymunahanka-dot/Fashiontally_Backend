/**
 * services/emailService.js
 *
 * Sends transactional emails via Brevo (formerly Sendinblue).
 */

const { sendBrevoEmail } = require('../config/brevo');

const generateOTP = (length = 6) =>
  Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');

const sendEmailOTP = async (email) => {
  if (!process.env.BREVO_API_KEY) {
    const err = 'Email OTP not configured. Add BREVO_API_KEY to .env';
    console.warn(err);
    return { success: false, error: err };
  }

  const otp            = generateOTP(6);
  const expiresMinutes = 10;

  try {
    await sendBrevoEmail({
      to:      email,
      subject: 'Your FashionTally Verification Code',
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background: #16988d; padding: 32px 40px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FashionTally</h1>
          </div>
          <div style="padding: 40px;">
            <h2 style="color: #111827; font-size: 20px; margin: 0 0 12px 0;">Your Verification Code</h2>
            <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
              Use the code below to verify your email address. It expires in <strong>${expiresMinutes} minutes</strong>.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <div style="display: inline-block; background: #f3f4f6; border-radius: 12px; padding: 20px 40px;">
                <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #16988d;">${otp}</span>
              </div>
            </div>
            <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 0;">
              If you did not request this code, you can safely ignore this email.
            </p>
          </div>
          <div style="background: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} FashionTally. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    console.log('✅ Email OTP sent via Brevo to:', email);
    return { success: true, otp };
  } catch (error) {
    console.error('❌ Brevo email OTP error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
};

module.exports = { sendEmailOTP, generateOTP };
