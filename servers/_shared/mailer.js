const nodemailer = require('nodemailer');

function createMailerFromEnv() {
  let transporterConfig = {};
  const service = (process.env.EMAIL_SERVICE || 'gmail').toLowerCase();

  if (service === 'outlook' || service === 'hotmail') {
    transporterConfig = {
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { ciphers: 'SSLv3' }
    };
  } else {
    transporterConfig = {
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    };
  }

  const transporter = nodemailer.createTransport(transporterConfig);
  const isConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);

  if (isConfigured) {
    transporter.verify()
      .then(() => console.log('✅ Email transporter verified — real emails will be sent.'))
      .catch((err) => console.error('❌ Email transporter verification FAILED:', err.message));
  } else {
    console.warn('⚠️  EMAIL_USER or EMAIL_PASS is not set. DEV MODE — OTP emails will be logged to console.');
  }

  return { transporter, isConfigured };
}

module.exports = { createMailerFromEnv };

