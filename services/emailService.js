/**
 * services/emailService.js
 *
 * Sends transactional emails via Brevo (formerly Sendinblue).
 */

const { sendBrevoEmail } = require('../config/brevo');

/**
 * Emails a verification code issued by otpService.
 * @param {string} email
 * @param {string} otp - the code to send
 * @param {number} expiresMinutes - shown to the user
 */
const sendEmailOTP = async (email, otp, expiresMinutes) => {
  if (!process.env.BREVO_API_KEY) {
    const err = 'Email OTP not configured. Add BREVO_API_KEY to .env';
    console.warn(err);
    return { success: false, error: err };
  }

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
    return { success: true };
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

  const isYearly     = payment.billingCycle === 'yearly';
  const cycleLabel   = isYearly ? 'Yearly' : 'Monthly';

  // Plan end date — the account's new end date, else 30 / 365 days from now
  const accountEnd = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
  const endDate = accountEnd && accountEnd > new Date()
    ? accountEnd
    : new Date(Date.now() + (isYearly ? 365 : 30) * 24 * 60 * 60 * 1000);
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
                <p style="color:#16988d;font-size:14px;font-weight:600;margin:8px 0 0 0;">${planType} Plan — ${cycleLabel}</p>
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

// ─────────────────────────────────────────────────────────────────────────────
// Account & billing notifications
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL          = () => process.env.FRONTEND_APP_URL || 'https://app.fashiontally.com';
const SITE_URL         = () => process.env.FRONTEND_URL || 'https://www.fashiontally.com';
const SUBSCRIPTION_URL = () => `${SITE_URL()}/subscription`;
const SUPPORT_EMAIL    = 'support@fashiontally.com';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const firstName = (name, email) => escapeHtml(String(name || '').trim().split(' ')[0] || String(email).split('@')[0]);

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Shared FashionTally email layout (same look as the welcome and reset emails).
 * `paragraphs` are trusted HTML strings — escape any user data before passing it in.
 */
const emailLayout = ({ heading, paragraphs, button, note }) => `
  <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <div style="background: #16988d; padding: 32px 40px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FashionTally</h1>
    </div>
    <div style="padding: 40px;">
      <h2 style="color: #111827; font-size: 20px; margin: 0 0 12px 0;">${heading}</h2>
      ${paragraphs.map((p) => `<p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">${p}</p>`).join('')}
      ${button ? `
      <div style="text-align: center; margin: 32px 0;">
        <a href="${button.url}" style="background: #16988d; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">
          ${button.text}
        </a>
      </div>` : ''}
      <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 0;">
        ${note || `Questions? Email us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #16988d;">${SUPPORT_EMAIL}</a>.`}
      </p>
    </div>
    <div style="background: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} FashionTally. All rights reserved.</p>
    </div>
  </div>
`;

/** Sends one email; never throws, so callers can fire and forget. */
const sendEmail = async (tag, to, subject, html) => {
  if (!process.env.BREVO_API_KEY) {
    console.warn(`[email:${tag}] BREVO_API_KEY not set — skipping email to ${to}`);
    return { success: false, error: 'Email not configured' };
  }
  try {
    await sendBrevoEmail({ to, subject, html });
    console.log(`[email:${tag}] ✅ sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error(`[email:${tag}] ❌ failed for ${to}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

const sendWelcomeEmail = (email, name) =>
  sendEmail('welcome', email, `Welcome to FashionTally, ${String(name || '').trim().split(' ')[0] || 'there'}! 🎉`, emailLayout({
    heading: `Welcome, ${escapeHtml(String(name || '').trim()) || 'there'}! 👋`,
    paragraphs: [
      `Your FashionTally account is ready. Your <strong>free trial</strong> has started — explore everything the platform has to offer.`,
      `Here's what you can do right away:`,
      `<span style="display: block; color: #374151; line-height: 2;">
        • Add your clients and track their measurements<br/>
        • Create and manage orders<br/>
        • Send invoices and track payments<br/>
        • Schedule appointments<br/>
        • Manage your inventory
      </span>`,
    ],
    button: { text: 'Get Started', url: APP_URL() },
    note: `If you have any questions, reply to this email — we're happy to help.`,
  }));

const sendPasswordChangedEmail = (email, name) =>
  sendEmail('password-changed', email, 'Your FashionTally password was changed', emailLayout({
    heading: 'Your password was changed',
    paragraphs: [
      `Hi ${firstName(name, email)},`,
      `The password for your FashionTally account (<strong>${escapeHtml(email)}</strong>) was changed on ${formatDate(Date.now())}.`,
      `If you made this change, you don't need to do anything.`,
      `<strong style="color: #b91c1c;">If this wasn't you</strong>, reset your password right away and contact us — someone else may have access to your account.`,
    ],
    button: { text: 'Reset Password', url: `${APP_URL()}/forgot-password` },
  }));

const sendAccountDeletedEmail = (email, name) =>
  sendEmail('account-deleted', email, 'Your FashionTally account has been deleted', emailLayout({
    heading: 'Your account has been deleted',
    paragraphs: [
      `Hi ${firstName(name, email)},`,
      `As requested, your FashionTally account (<strong>${escapeHtml(email)}</strong>) was deleted on ${formatDate(Date.now())}.`,
      `Thank you for using FashionTally. You're welcome back any time.`,
      `<strong style="color: #b91c1c;">Didn't request this?</strong> Contact us immediately at <a href="mailto:${SUPPORT_EMAIL}" style="color: #16988d;">${SUPPORT_EMAIL}</a>.`,
    ],
    note: 'This is a one-time confirmation. You will not receive further emails about this account.',
  }));

/**
 * @param {object} invite
 * @param {string} invite.name - team member's name
 * @param {string} invite.inviterName - business or owner name
 * @param {string} invite.setPasswordUrl - link to choose a password
 * @param {number} invite.expiresDays
 */
const sendTeamInviteEmail = (email, { name, inviterName, setPasswordUrl, expiresDays }) =>
  sendEmail('team-invite', email, `You've been added to ${String(inviterName || 'a team').trim()} on FashionTally`, emailLayout({
    heading: "You've been invited to FashionTally",
    paragraphs: [
      `Hi ${firstName(name, email)},`,
      `<strong>${escapeHtml(inviterName || 'A FashionTally business')}</strong> has added you as a team member on FashionTally.`,
      `Choose your own password to get started. You'll then sign in with <strong>${escapeHtml(email)}</strong>.`,
    ],
    button: { text: 'Set Your Password', url: setPasswordUrl },
    note: `This link expires in ${expiresDays} days. If you weren't expecting this invitation, you can ignore this email.`,
  }));

/**
 * @param {object} details
 * @param {boolean} [details.byAdmin] - cancelled by FashionTally staff rather than the user
 */
const sendSubscriptionCancelledEmail = (email, { name, planType, byAdmin }) =>
  sendEmail('subscription-cancelled', email, 'Your FashionTally subscription has been cancelled', emailLayout({
    heading: 'Your subscription has been cancelled',
    paragraphs: [
      `Hi ${firstName(name, email)},`,
      byAdmin
        ? `Your FashionTally ${escapeHtml(planType || '')} subscription has been cancelled by our team.`
        : `We've cancelled your FashionTally ${escapeHtml(planType || '')} subscription as you requested.`,
      `Your account and data are still here. Subscribe again any time to pick up where you left off.`,
      byAdmin
        ? `If you think this is a mistake, contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #16988d;">${SUPPORT_EMAIL}</a>.`
        : `<strong>Didn't cancel?</strong> Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #16988d;">${SUPPORT_EMAIL}</a> right away.`,
    ],
    button: { text: 'Resubscribe', url: SUBSCRIPTION_URL() },
  }));

/**
 * @param {object} details
 * @param {string} details.status - Flutterwave status, e.g. "failed" or "cancelled"
 */
const sendPaymentFailedEmail = (email, { name, planType, amount, status }) => {
  const cancelled = /cancel/i.test(String(status || ''));
  const price = amount
    ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount)
    : '';
  return sendEmail('payment-failed', email, cancelled ? 'Your FashionTally payment was not completed' : 'Your FashionTally payment failed', emailLayout({
    heading: cancelled ? 'Your payment was not completed' : "Your payment didn't go through",
    paragraphs: [
      `Hi ${firstName(name, email)},`,
      cancelled
        ? `You started a payment for the FashionTally ${escapeHtml(planType || '')} plan${price ? ` (${price})` : ''}, but it wasn't completed.`
        : `We couldn't process your payment for the FashionTally ${escapeHtml(planType || '')} plan${price ? ` (${price})` : ''}. You have not been charged.`,
      `You can try again with the same or a different payment method.`,
    ],
    button: { text: 'Try Again', url: SUBSCRIPTION_URL() },
  }));
};

const BILLING_REMINDERS = {
  trial_ending: (d) => ({
    subject: 'Your FashionTally free trial ends soon',
    heading: 'Your free trial ends soon',
    body: [`Your FashionTally free trial ends on <strong>${d.endDate}</strong>.`, `Subscribe before then to keep managing your clients, orders and invoices without interruption.`],
    button: 'Choose a Plan',
  }),
  trial_ended: (d) => ({
    subject: 'Your FashionTally trial has ended',
    heading: 'Your free trial has ended',
    body: [`Your FashionTally trial ended on <strong>${d.endDate}</strong>.`, `Your clients, orders and invoices are saved. Subscribe to get back to them.`],
    button: 'Subscribe Now',
  }),
  plan_3d: (d) => ({
    subject: `Your FashionTally ${d.planType} plan ends in ${d.daysLeft} days`,
    heading: `Your plan ends in ${d.daysLeft} days`,
    body: [`Your FashionTally <strong>${d.planType}</strong> plan ends on <strong>${d.endDate}</strong>.`, `Renew before then to keep everything running smoothly.`],
    button: 'Renew Plan',
  }),
  plan_1d: (d) => ({
    subject: `Your FashionTally ${d.planType} plan ends tomorrow`,
    heading: 'Your plan ends tomorrow',
    body: [`Your FashionTally <strong>${d.planType}</strong> plan ends on <strong>${d.endDate}</strong>.`, `Renew now to avoid losing access.`],
    button: 'Renew Plan',
  }),
  plan_expired: (d) => ({
    subject: `Your FashionTally ${d.planType} plan has expired`,
    heading: 'Your plan has expired',
    body: [`Your FashionTally <strong>${d.planType}</strong> plan expired on <strong>${d.endDate}</strong>.`, `Your data is safe. Renew to pick up right where you left off.`],
    button: 'Renew Plan',
  }),
};

/**
 * @param {keyof BILLING_REMINDERS} kind
 * @param {object} details - { name, planType, endDate (Date|string), daysLeft }
 */
const sendBillingReminderEmail = (kind, email, { name, planType, endDate, daysLeft }) => {
  const content = BILLING_REMINDERS[kind]({
    planType: escapeHtml(planType || 'Growth'),
    endDate: formatDate(endDate),
    daysLeft,
  });
  return sendEmail(`billing:${kind}`, email, content.subject, emailLayout({
    heading: content.heading,
    paragraphs: [`Hi ${firstName(name, email)},`, ...content.body],
    button: { text: content.button, url: SUBSCRIPTION_URL() },
  }));
};

module.exports = {
  sendEmailOTP,
  sendSubscriptionReceipt,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  sendAccountDeletedEmail,
  sendTeamInviteEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
  sendBillingReminderEmail,
  BILLING_REMINDER_KINDS: Object.keys(BILLING_REMINDERS),
};
