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

/**
 * sendSubscriptionReceipt
 *
 * Sends a styled payment receipt to the user after a successful subscription.
 *
 * @param {string} email        - User's email address
 * @param {object} payment      - Payment record from DB
 * @param {object} user         - User record from DB (name, businessName, etc.)
 */
const sendSubscriptionReceipt = async (email, payment, user = {}) => {
  if (!process.env.BREVO_API_KEY) {
    console.warn('[receipt] BREVO_API_KEY not set — skipping receipt email');
    return { success: false, error: 'Email not configured' };
  }

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount || 0);

  const formatDate = (dateStr) => {
    if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const name         = user.name || user.businessName || email.split('@')[0];
  const planType     = payment.plantype || payment.planType || 'Growth';
  const amount       = payment.planPrice || payment.amount || 0;
  const txRef        = payment.transactionId || payment.txRef || payment.id || '—';
  const paidAt       = formatDate(payment.paidAt || payment.createdAt);
  const receiptNo    = `RCP-${Date.now().toString(36).toUpperCase()}`;

  // Plan end date — 30 days from now
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);
  const subscriptionEnd = endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  try {
    await sendBrevoEmail({
      to:      email,
      subject: `Payment Receipt – FashionTally ${planType} Plan`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FashionTally Receipt</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#16988d 0%,#0d7a71 100%);padding:36px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0 0 4px 0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">FashionTally</h1>
              <p style="color:rgba(255,255,255,0.8);margin:0;font-size:14px;">Payment Receipt</p>
            </td>
          </tr>

          <!-- Success badge -->
          <tr>
            <td style="padding:28px 40px 0;text-align:center;">
              <div style="display:inline-block;background:#dcfce7;border-radius:50px;padding:10px 24px;">
                <span style="color:#166534;font-size:14px;font-weight:700;">✓ &nbsp;Payment Successful</span>
              </div>
              <h2 style="color:#111827;font-size:22px;font-weight:700;margin:16px 0 4px 0;">Thank you, ${name}!</h2>
              <p style="color:#6b7280;font-size:15px;margin:0;">Your subscription has been activated.</p>
            </td>
          </tr>

          <!-- Amount box -->
          <tr>
            <td style="padding:24px 40px;">
              <div style="background:#f9fafb;border:2px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;">
                <p style="color:#6b7280;font-size:13px;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.06em;">Amount Paid</p>
                <p style="color:#111827;font-size:40px;font-weight:800;margin:0;line-height:1.1;">${formatCurrency(amount)}</p>
                <p style="color:#16988d;font-size:14px;font-weight:600;margin:8px 0 0 0;">${planType} Plan — Monthly</p>
              </div>
            </td>
          </tr>

          <!-- Receipt details -->
          <tr>
            <td style="padding:0 40px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                <tr style="background:#f9fafb;">
                  <td colspan="2" style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Receipt Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Receipt No.</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;font-weight:600;text-align:right;">${receiptNo}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Transaction Ref</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;font-weight:600;text-align:right;word-break:break-all;">${txRef}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Date Paid</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;font-weight:600;text-align:right;">${paidAt}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Plan</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;font-weight:600;text-align:right;">${planType}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;font-size:14px;color:#6b7280;">Valid Until</td>
                  <td style="padding:14px 20px;font-size:14px;color:#16988d;font-weight:700;text-align:right;">${subscriptionEnd}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 36px;text-align:center;">
              <a href="https://app.fashiontally.com/dashboard"
                style="display:inline-block;background:#16988d;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;">
                Go to Dashboard →
              </a>
              <p style="color:#9ca3af;font-size:13px;margin:20px 0 0 0;line-height:1.6;">
                Questions? Email us at <a href="mailto:support@fashiontally.com" style="color:#16988d;">support@fashiontally.com</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} FashionTally. All rights reserved.<br/>
                This is an automated receipt. Please keep it for your records.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
      `,
    });

    console.log(`[receipt] ✅ Subscription receipt sent to: ${email}`);
    return { success: true };
  } catch (error) {
    console.error('[receipt] ❌ Failed to send receipt:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmailOTP, generateOTP, sendSubscriptionReceipt };
