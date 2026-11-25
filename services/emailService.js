/**
 * services/emailService.js
 *
 * Sends transactional emails via Brevo (formerly Sendinblue).
 */

const { sendBrevoEmail } = require('../config/brevo');
const { appBadges } = require('./emailBadges');

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
            ${appBadges()}
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
  const txRef        = payment.transactionId || payment.txRef || payment.id || 'N/A';
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
      subject: `Payment Receipt: FashionTally ${planType} Plan`,
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
                <p style="color:#16988d;font-size:14px;font-weight:600;margin:8px 0 0 0;">${planType} Plan (${cycleLabel})</p>
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
              ${appBadges()}
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
// Demo video shown in the welcome email. The thumbnail ships with this backend (public/email, served at /email).
const DEMO_VIDEO_URL   = 'https://www.youtube.com/watch?v=f4s-UPk7pq0';
const DEMO_VIDEO_THUMB = () => `${(process.env.BACKEND_URL || 'https://backend.fashiontally.com').replace(/\/+$/, '')}/email/welcome-demo-video.jpg`;

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
      ${appBadges()}
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} FashionTally. All rights reserved.</p>
    </div>
  </div>
`;

/** Sends one email; never throws, so callers can fire and forget. */
const sendEmail = async (tag, to, subject, html, text) => {
  if (!process.env.BREVO_API_KEY) {
    console.warn(`[email:${tag}] BREVO_API_KEY not set — skipping email to ${to}`);
    return { success: false, error: 'Email not configured' };
  }
  try {
    await sendBrevoEmail({ to, subject, html, text });
    console.log(`[email:${tag}] ✅ sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error(`[email:${tag}] ❌ failed for ${to}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

const welcomeText = (name) => [
  `Welcome, ${String(name || '').trim() || 'there'}!`,
  '',
  'Your FashionTally account is ready. Your free trial has started. Explore everything the platform has to offer.',
  '',
  "Here's what you can do right away:",
  '- Add your clients and track their measurements',
  '- Create and manage orders',
  '- Send invoices and track payments',
  '- Schedule appointments',
  '- Manage your inventory',
  '',
  `Watch the demo video (15 min): ${DEMO_VIDEO_URL}`,
  '',
  `Get started: ${APP_URL()}`,
  '',
  "If you have any questions, reply to this email. We're happy to help.",
].join('\n');

// Same dark design as the custom emails admins send (brandLayout)
const sendWelcomeEmail = (email, name) =>
  sendEmail('welcome', email, `Welcome to FashionTally, ${String(name || '').trim().split(' ')[0] || 'there'}! 🎉`, brandLayout({
    label: 'Welcome',
    heading: 'Welcome to FashionTally 👋',
    paragraphs: [
      `Hi ${firstName(name, email)},`,
      `Your FashionTally account is ready. Your <strong style="color:#f3f3f1;">free trial</strong> has started. Explore everything the platform has to offer.`,
      `Here's what you can do right away:<br/>
        <span style="display:block;margin-top:6px;line-height:2;color:#f3f3f1;">
        <span style="color:#2fd3c3;">&#10003;</span>&nbsp; Add your clients and track their measurements<br/>
        <span style="color:#2fd3c3;">&#10003;</span>&nbsp; Create and manage orders<br/>
        <span style="color:#2fd3c3;">&#10003;</span>&nbsp; Send invoices and track payments<br/>
        <span style="color:#2fd3c3;">&#10003;</span>&nbsp; Schedule appointments<br/>
        <span style="color:#2fd3c3;">&#10003;</span>&nbsp; Manage your inventory
        </span>`,
      `New here? Watch the demo video to see how it all works.`,
    ],
    video: { url: DEMO_VIDEO_URL, image: DEMO_VIDEO_THUMB(), caption: 'Watch the demo video (15 min)' },
    button: { text: 'Get Started', url: APP_URL() },
  }), welcomeText(name));

const sendPasswordChangedEmail = (email, name) =>
  sendEmail('password-changed', email, 'Your FashionTally password was changed', emailLayout({
    heading: 'Your password was changed',
    paragraphs: [
      `Hi ${firstName(name, email)},`,
      `The password for your FashionTally account (<strong>${escapeHtml(email)}</strong>) was changed on ${formatDate(Date.now())}.`,
      `If you made this change, you don't need to do anything.`,
      `<strong style="color: #b91c1c;">If this wasn't you</strong>, reset your password right away and contact us. Someone else may have access to your account.`,
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

/**
 * Layout for admin emails, dark like the landing page: a branded header (logo, label, subject as
 * the headline, teal glow) over a dark body, on a near-black background.
 * Tables + inline styles so it holds up in Gmail, Outlook and Apple Mail; the glow is a gradient
 * over a plain dark colour for clients that drop gradients.
 * `paragraphs` are trusted HTML strings: escape user data before passing it in.
 * `video` (optional): { url, image, caption }, a clickable thumbnail shown before the button
 * (email apps can't play video inline, so it links out).
 * Optional for automated emails: `lang` ('en' | 'fr') for the fixed texts, `preheader` (the grey
 * preview line inboxes show after the subject), `signOff` (HTML after the button) and
 * `unsubscribeUrl` (adds an unsubscribe link to the footer).
 */
const LAYOUT_TEXT = {
  en: {
    help: 'Need a hand? Our team is happy to help on',
    footer: "You're receiving this as part of the FashionTally community: the workspace for fashion businesses.",
    website: 'Website',
    openApp: 'Open the app',
    unsubscribe: 'Unsubscribe from these emails',
  },
  fr: {
    help: "Besoin d'aide ? Notre équipe vous répond sur",
    footer: 'Vous recevez cet e-mail en tant que membre de la communauté FashionTally : l’espace de travail des entreprises de mode.',
    website: 'Site web',
    openApp: "Ouvrir l'application",
    unsubscribe: 'Se désabonner de ces e-mails',
  },
};

const brandLayout = ({ label, heading, paragraphs, video, button, lang = 'en', preheader, signOff, unsubscribeUrl, appUrl }) => {
  const font = `Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
  const site = SITE_URL();
  const siteHost = site.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const t = LAYOUT_TEXT[lang] || LAYOUT_TEXT.en;
  return `
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#050505;">${preheader}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>` : ''}
<div style="margin:0;padding:0;background:#050505;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505" style="background:#050505;">
    <tr><td align="center" style="padding:28px 12px 36px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;font-family:${font};">
        <tr><td bgcolor="#0d0d0d" style="border-radius:20px;overflow:hidden;background:#0d0d0d;border:1px solid rgba(255,255,255,0.09);">

          <!-- Header -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="#0b1413" style="background-color:#0b1413;border-bottom:1px solid rgba(255,255,255,0.07);background-image:radial-gradient(70% 90% at 85% 0%, rgba(47,211,195,0.30), rgba(0,0,0,0) 70%), radial-gradient(60% 80% at 0% 100%, rgba(22,152,141,0.28), rgba(0,0,0,0) 70%);padding:28px 36px 36px 36px;border-radius:20px 20px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <a href="${site}" style="text-decoration:none;">
                      <img src="${site}/logo.png" width="30" height="30" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;" />
                      <span style="display:inline-block;vertical-align:middle;margin-left:9px;font-size:16px;font-weight:600;letter-spacing:-0.2px;color:#f3f3f1;">FashionTally</span>
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;padding:5px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:rgba(243,243,241,0.8);">${label}</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:34px 0 0 0;font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-0.8px;color:#ffffff;">${heading}</h1>
              <div style="margin-top:18px;width:44px;height:3px;border-radius:3px;background:#2fd3c3;line-height:3px;font-size:0;">&nbsp;</div>
            </td></tr>
          </table>

          <!-- Body -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:34px 36px 38px 36px;">
              ${paragraphs.map((p, i) => `<p style="margin:0 0 16px 0;font-size:${i === 0 ? '16px' : '15px'};line-height:1.75;color:${i === 0 ? '#f3f3f1' : 'rgba(243,243,241,0.72)'};${i === 0 ? 'font-weight:600;' : ''}">${p}</p>`).join('')}
              ${video ? `
              <!-- Video: thumbnail with a play button baked in, linking to the video -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0 0;">
                <tr><td style="border-radius:14px;border:1px solid rgba(255,255,255,0.12);overflow:hidden;line-height:0;font-size:0;">
                  <a href="${video.url}" style="display:block;text-decoration:none;">
                    <img src="${video.image}" width="508" alt="${video.caption}" style="display:block;width:100%;max-width:508px;height:auto;border:0;border-radius:14px;" />
                  </a>
                </td></tr>
                <tr><td style="padding-top:12px;font-size:14px;line-height:1.5;">
                  <a href="${video.url}" style="color:#2fd3c3;font-weight:600;text-decoration:none;">&#9654;&nbsp; ${video.caption}</a>
                </td></tr>
              </table>` : ''}
              ${button ? `
              <!-- Button: teal-to-mint pill with a soft glow; solid teal where gradients aren't supported -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0 0;">
                <tr><td bgcolor="#16988d" style="border-radius:999px;background-color:#16988d;background-image:linear-gradient(135deg,#2fd3c3 0%,#16988d 100%);box-shadow:0 8px 24px rgba(47,211,195,0.28), inset 0 1px 0 rgba(255,255,255,0.25);">
                  <a href="${button.url}" style="display:inline-block;padding:15px 30px 15px 30px;border-radius:999px;color:#04201d;font-size:15px;font-weight:700;letter-spacing:0.1px;text-decoration:none;mso-padding-alt:0;">
                    ${button.text}&nbsp;&nbsp;<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:rgba(4,32,29,0.14);font-size:13px;">&rarr;</span>
                  </a>
                </td></tr>
              </table>` : ''}
              ${signOff ? `<div style="margin:34px 0 0 0;font-size:15px;line-height:1.6;color:rgba(243,243,241,0.72);">${signOff}</div>` : ''}
            </td></tr>
          </table>

          <!-- Help strip -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="#111312" style="padding:18px 36px;background:#111312;border-top:1px solid rgba(255,255,255,0.07);font-size:13px;line-height:1.6;color:rgba(243,243,241,0.6);border-radius:0 0 20px 20px;">
              ${t.help} <a href="${site}/contact" style="color:#2fd3c3;font-weight:600;text-decoration:none;">${siteHost}/contact</a>
            </td></tr>
          </table>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:22px 12px 0 12px;font-size:12px;line-height:1.7;color:#6f6f6c;">
          ${appBadges()}
          ${t.footer}<br/>
          <a href="${site}" style="color:#a6a6a2;text-decoration:none;font-weight:600;">${t.website}</a>
          &nbsp;·&nbsp;
          <a href="${appUrl || APP_URL()}" style="color:#a6a6a2;text-decoration:none;font-weight:600;">${t.openApp}</a>
          ${unsubscribeUrl ? `&nbsp;·&nbsp;<a href="${unsubscribeUrl}" style="color:#a6a6a2;text-decoration:underline;">${t.unsubscribe}</a>` : ''}
          <br/>© ${new Date().getFullYear()} FashionTally
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
};

/**
 * Subject + HTML of a message an admin writes (plain text, escaped). `campaign` marks emails sent
 * to many users (labelled "Update"); a one-off message to one user is labelled "Message".
 * Also used for the admin panel's email preview.
 */
const buildAdminMessageEmail = (email, { name, subject, message, campaign } = {}) => {
  const cleanSubject = String(subject || 'A message from FashionTally').slice(0, 150);
  const first = String(name || '').trim().split(' ')[0] || String(email).split('@')[0];
  return {
    subject: cleanSubject,
    text: `Hi ${first},\n\n${String(message || '').trim()}\n\nOpen FashionTally: ${APP_URL()}\n\n© ${new Date().getFullYear()} FashionTally`,
    html: brandLayout({
      label: campaign ? 'Update' : 'Message',
      heading: escapeHtml(cleanSubject),
      paragraphs: [
        `Hi ${firstName(name, email)},`,
        ...String(message || '')
          .split(/\n{2,}/)
          .map((para) => escapeHtml(para.trim()).replace(/\n/g, '<br/>'))
          .filter(Boolean),
      ],
      button: { text: 'Open FashionTally', url: APP_URL() },
    }),
  };
};

/** A message an admin writes to a user from the admin panel */
const sendAdminMessageEmail = (email, options = {}) => {
  const { subject, html, text } = buildAdminMessageEmail(email, options);
  return sendEmail(options.campaign ? 'admin-campaign' : 'admin-message', email, subject, html, text);
};

module.exports = {
  brandLayout,
  sendEmail,
  escapeHtml,
  SITE_URL,
  APP_URL,
  sendAdminMessageEmail,
  buildAdminMessageEmail,
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
