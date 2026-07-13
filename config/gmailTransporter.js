const nodemailer = require('nodemailer');

const port   = parseInt(process.env.EMAIL_PORT || '465');
const secure = port === 465; // true for 465 (SSL), false for 587 (TLS)

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
  port,
  secure,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // allow self-signed certs in some environments
  },
});

/**
 * Send an email.
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const info = await transporter.sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
  });
  console.log(`[gmail] Email sent to ${to}: ${info.messageId}`);
  return info;
};

module.exports = { transporter, sendEmail };
