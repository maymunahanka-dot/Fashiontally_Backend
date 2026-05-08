const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'live.smtp.mailtrap.io',
  port: 587,
  auth: {
    user: 'api',
    pass: process.env.MAILTRAP_TOKEN,
  },
});

module.exports = transporter;
