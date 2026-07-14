/**
 * gmailTransporter.js  (now uses Brevo HTTP API)
 *
 * Switched from nodemailer SMTP → Brevo HTTP API so it works on
 * DigitalOcean / any host without SMTP port restrictions.
 */

const https = require('https');

/**
 * Send a single email via Brevo API.
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 */
const sendEmail = ({ to, subject, html, text }) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender:      { name: 'FashionTally', email: process.env.BREVO_SENDER_EMAIL },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text || html.replace(/<[^>]*>/g, ''),
    });

    const options = {
      hostname: 'api.brevo.com',
      path:     '/v3/smtp/email',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'api-key':        process.env.BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[brevo] ✉ Sent to ${to} — ${res.statusCode}`);
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

module.exports = { sendEmail };
