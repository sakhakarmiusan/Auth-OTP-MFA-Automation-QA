const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const express = require('express');
const { createStores } = require('../_shared/auth-store');
const { createMailerFromEnv } = require('../_shared/mailer');
const { createSessionMiddleware } = require('../_shared/session');

// Twilio SMS Config (optional)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  // eslint-disable-next-line global-require
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const PORT = Number(process.env.OTP_PORT || process.env.PORT || 3000);
const app = express();

const { users, pending } = createStores();
const { transporter, isConfigured: isEmailConfigured } = createMailerFromEnv();
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

app.use(express.json());
app.use(createSessionMiddleware());
app.use(express.static(path.join(__dirname, 'public')));

// Register -> send OTP
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password, method } = req.body;
  const identifier = method === 'phone' ? phone : email;

  if (!identifier) return res.status(400).json({ error: 'Missing identifier.' });
  if (!password) return res.status(400).json({ error: 'Missing password.' });
  if (users.has(identifier)) return res.status(400).json({ error: 'Already registered.' });

  const otp = generateOTP();
  pending.set(identifier, {
    name: name || '',
    email: email || '',
    phone: phone || '',
    password,
    method,
    otp
  });

  try {
    if (method === 'phone') {
      if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
        console.log(`[DEV MODE] OTP for ${phone}: ${otp}`);
        return res.json({ success: true, identifier, message: 'OTP logged to server console.' });
      }
      await twilioClient.messages.create({
        body: `Your OTP code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
      });
      return res.json({ success: true, identifier, message: 'OTP sent via SMS.' });
    }

    if (!isEmailConfigured) {
      console.log(`[DEV MODE] OTP for ${email}: ${otp}`);
      return res.json({ success: true, identifier, message: 'OTP logged to server console.' });
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Verification Code',
      text: `Your 6-digit OTP code is: ${otp}`
    });
    return res.json({ success: true, identifier, message: 'OTP sent via email.' });
  } catch (err) {
    console.error('OTP send error:', err);
    return res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// Verify OTP -> create user + log in (dashboard)
app.post('/api/verify-otp', (req, res) => {
  const { identifier, otp } = req.body;
  const p = pending.get(identifier);
  if (!p) return res.status(400).json({ error: 'No pending registration.' });
  if (p.otp !== otp) return res.status(400).json({ error: 'Invalid OTP.' });

  const user = {
    name: p.name,
    email: p.email,
    phone: p.phone,
    password: p.password
  };
  users.set(identifier, user);
  pending.delete(identifier);

  req.session.loggedInUser = { name: user.name, email: user.email, phone: user.phone };
  return res.json({ success: true, user: req.session.loggedInUser });
});

// Login (no OTP in this mode — OTP is for registration practice)
app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;
  const user = users.get(identifier);
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials.' });
  req.session.loggedInUser = { name: user.name, email: user.email, phone: user.phone };
  return res.json({ success: true, user: req.session.loggedInUser });
});

app.get('/api/me', (req, res) => {
  if (req.session.loggedInUser) return res.json({ user: req.session.loggedInUser });
  return res.status(401).json({ error: 'Not logged in.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.listen(PORT, () => {
  console.log(`OTP-only server running at http://localhost:${PORT}`);
});

