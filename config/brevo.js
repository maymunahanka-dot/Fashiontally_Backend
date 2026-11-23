/**
 * config/brevo.js
 *
 * Brevo (formerly Sendinblue) transactional email client.
 * Uses Brevo's REST API directly via axios — no extra SDK needed.
 */

const axios = require('axios');

/**
 * Optional: senderName (default "FashionTally"), replyTo (email), tags (array, shown in Brevo's logs),
 * headers (e.g. List-Unsubscribe). Returns Brevo's response, which includes the messageId.
 */
async function sendBrevoEmail({ to, subject, html, text, senderName, replyTo, tags, headers }) {
  const res = await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender:   { name: senderName || 'FashionTally', email: process.env.BREVO_SENDER_EMAIL },
      to:       [{ email: to }],
      subject,
      htmlContent: html,
      // A plain-text copy alongside the HTML makes spam filters trust the email more
      ...(text ? { textContent: text } : {}),
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      ...(tags?.length ? { tags } : {}),
      ...(headers ? { headers } : {}),
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
