const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'live.smtp.mailtrap.io',
  port: 587,
  auth: {
    user: 'api',
    pass: process.env.MAILTRAP_TOKEN,
  },
});

/**
 * Send an email.
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const info = await transporter.sendMail({
    from:    '"FashionTally" <no-reply@fashiontally.com>',
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
  });
  console.log(`[mailtrap] Email sent to ${to}: ${info.messageId}`);
  return info;
};

module.exports = { transporter, sendEmail };
