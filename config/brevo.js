/**
 * config/brevo.js
 *
 * Brevo (formerly Sendinblue) transactional email client.
 * Uses Brevo's REST API directly via axios — no extra SDK needed.
 */

const axios = require('axios');

async function sendBrevoEmail({ to, subject, html }) {
  const res = await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender:   { name: 'FashionTally', email: process.env.BREVO_SENDER_EMAIL },
      to:       [{ email: to }],
      subject,
      htmlContent: html,
    },
    {
      headers: {
        'api-key':      process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );
  return res.data;
}

module.exports = { sendBrevoEmail };
