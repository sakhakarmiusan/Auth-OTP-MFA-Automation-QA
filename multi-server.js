const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const svgCaptcha = require('svg-captcha');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

// Twilio SMS Config (optional)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  // eslint-disable-next-line global-require
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const PORT_OTP = Number(process.env.OTP_PORT || 3000);
const PORT_CAPTCHA = Number(process.env.CAPTCHA_PORT || 5000);
const PORT_MFA = Number(process.env.MFA_PORT || 8000);

// ---- Shared in-memory stores (shared because all apps run in one Node process) ----
const users = new Map();
const pendingUsers = new Map();

// ---- Shared session middleware (same cookie + same store for all ports) ----
const sharedSessionStore = new session.MemoryStore();
const sessionMiddleware = session({
  name: process.env.SESSION_COOKIE_NAME || 'connect.sid',
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  store: sharedSessionStore,
  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
});

function buildAppBase({ staticDir, allowOrigins }) {
  const app = express();
  app.use(express.json());

  // Cross-port calls need CORS + credentials. Implemented without extra deps.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowOrigins.includes(origin)) {
      return res.status(403).json({ error: `CORS blocked for origin: ${origin}` });
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  // Shared cookie session across all ports.
  app.use(sessionMiddleware);

  if (staticDir) {
    app.use(express.static(staticDir));
  }

  return app;
}

// ---- Nodemailer setup (same behavior as monolith) ----
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
const isEmailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
if (isEmailConfigured) {
  transporter.verify()
    .then(() => console.log('✅ Email transporter verified — real emails will be sent.'))
    .catch((err) => console.error('❌ Email transporter verification FAILED:', err.message));
} else {
  console.warn('⚠️  EMAIL_USER or EMAIL_PASS is not set. DEV MODE — email OTP will be logged to console.');
}

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// =====================================================================================
// OTP server (3000): serves UI + handles Register + Login + Login-OTP
// =====================================================================================
const otpApp = buildAppBase({
  staticDir: path.join(__dirname, 'public'),
  allowOrigins: [`http://localhost:${PORT_OTP}`, `http://localhost:${PORT_CAPTCHA}`, `http://localhost:${PORT_MFA}`]
});

// Swagger UI (in multi-server mode, expose docs on the main UI port)
otpApp.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

otpApp.post('/api/register', async (req, res) => {
  const { name, email, phone, password, method } = req.body;
  const identifier = method === 'phone' ? phone : email;

  if (!identifier) return res.status(400).json({ error: 'Missing identifier.' });
  if (users.has(identifier)) {
    return res.status(400).json({ error: `${method === 'phone' ? 'Phone number' : 'Email'} already registered.` });
  }

  const otp = generateOTP();

  pendingUsers.set(identifier, {
    name,
    email: email || '',
    phone: phone || '',
    password,
    method,
    emailOtp: otp
  });

  try {
    if (method === 'phone') {
      if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
        console.log(`[DEV MODE] Simulated SMS Code for ${phone}: ${otp}`);
        return res.json({
          success: true,
          identifier,
          devOtp: process.env.SHOW_DEV_OTPS === 'true' ? otp : undefined,
          message: 'OTP logged to server console (Add Twilio config for real SMS)'
        });
      }

      await twilioClient.messages.create({
        body: `Your SecureAuth verification code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
      });
      return res.json({
        success: true,
        identifier,
        devOtp: process.env.SHOW_DEV_OTPS === 'true' ? otp : undefined,
        message: 'Verification SMS sent.'
      });
    }

    if (!isEmailConfigured) {
      console.log(`[DEV MODE] Simulated Email Code for ${email}: ${otp}`);
      return res.json({
        success: true,
        identifier,
        devOtp: process.env.SHOW_DEV_OTPS === 'true' ? otp : undefined,
        message: 'OTP logged to server console (Add .env for real email)'
      });
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Registration Verification Code',
      text: `Your 6-digit email verification code is: ${otp}`
    });

    return res.json({
      success: true,
      identifier,
      devOtp: process.env.SHOW_DEV_OTPS === 'true' ? otp : undefined,
      message: 'Verification email sent.'
    });
  } catch (err) {
    console.error('OTP send error:', err);
    return res.status(500).json({ error: `Failed to send ${method === 'phone' ? 'SMS' : 'email'}. Check configuration.` });
  }
});

// DEV helper: create a user without running the full registration flow.
// Enabled only when ALLOW_DEV_ENDPOINTS=true.
otpApp.post('/api/dev/create-user', async (req, res) => {
  if (process.env.ALLOW_DEV_ENDPOINTS !== 'true') {
    return res.status(404).json({ error: 'Not found.' });
  }

  const { name, identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ error: 'identifier and password are required.' });
  if (users.has(identifier)) return res.status(400).json({ error: 'User already exists.' });

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(identifier, 'SecureAuthApp', secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauth);

  users.set(identifier, {
    name: name || 'Dev User',
    email: identifier.includes('@') ? identifier : '',
    phone: identifier.includes('@') ? '' : identifier,
    password,
    totpSecret: secret
  });

  return res.json({ success: true, identifier, secret, qrCodeUrl });
});

otpApp.post('/api/verify-email', async (req, res) => {
  const { identifier, otp } = req.body;
  const pending = pendingUsers.get(identifier);

  if (!pending || pending.emailOtp !== otp) {
    return res.status(400).json({ error: 'Invalid or expired OTP.' });
  }

  // Keep existing registration flow behavior: OTP verified -> require CAPTCHA (registration CAPTCHA remains on 3000)
  pending.emailVerified = true;
  return res.json({ success: true, requireCaptcha: true, message: 'OTP verified. Please complete the CAPTCHA.' });
});

// Registration CAPTCHA (kept on 3000 to avoid changing the registration UX)
otpApp.get('/api/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    size: 5,
    noise: 3,
    color: true,
    background: '#f0f0f0'
  });
  req.session.registrationCaptchaText = captcha.text;
  res.json({ success: true, captchaSvg: captcha.data });
});

otpApp.post('/api/verify-captcha', async (req, res) => {
  const { identifier, captchaAnswer } = req.body;
  const pending = pendingUsers.get(identifier);

  if (!pending || !pending.emailVerified) {
    return res.status(400).json({ error: 'OTP not verified yet.' });
  }

  const expected = req.session.registrationCaptchaText;
  if (!expected || expected.toLowerCase() !== String(captchaAnswer || '').toLowerCase()) {
    return res.status(400).json({ error: 'Incorrect CAPTCHA. Please try again.' });
  }

  // CAPTCHA passed — generate TOTP secret for Authenticator
  req.session.registrationCaptchaText = null;
  const secret = authenticator.generateSecret();
  const userIdentifier = pending.email || pending.phone;
  const otpauth = authenticator.keyuri(userIdentifier, 'SecureAuthApp', secret);

  try {
    const qrCodeDataUrl = await qrcode.toDataURL(otpauth);
    const newUser = {
      name: pending.name,
      email: pending.email,
      phone: pending.phone,
      password: pending.password,
      totpSecret: secret
    };

    users.set(identifier, newUser);
    pendingUsers.delete(identifier);

    return res.json({
      success: true,
      message: 'CAPTCHA verified! Please scan the QR code to setup your Authenticator app.',
      qrCodeUrl: qrCodeDataUrl,
      secret
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error generating QR code.' });
  }
});

// NEW: Password login now triggers OTP (step 1 on port 3000)
otpApp.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  const user = users.get(identifier);

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const otp = generateOTP();
  req.session.pendingLoginIdentifier = identifier;
  req.session.loginOtp = otp;
  req.session.loginOtpVerified = false;
  req.session.captchaVerified = false;

  // For practice: OTP is always "sent" (email if configured else console).
  if (user.email) {
    if (!isEmailConfigured) {
      console.log(`[DEV MODE] Login OTP for ${user.email}: ${otp}`);
    } else {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Your Login Verification Code',
          text: `Your 6-digit login verification code is: ${otp}`
        });
      } catch (e) {
        console.warn('Email send failed, falling back to console log:', e.message);
        console.log(`[FALLBACK] Login OTP for ${user.email}: ${otp}`);
      }
    }
  } else if (user.phone) {
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      console.log(`[DEV MODE] Login OTP (SMS) for ${user.phone}: ${otp}`);
    } else {
      try {
        await twilioClient.messages.create({
          body: `Your SecureAuth login code is: ${otp}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: user.phone
        });
      } catch (e) {
        console.warn('SMS send failed, falling back to console log:', e.message);
        console.log(`[FALLBACK] Login OTP (SMS) for ${user.phone}: ${otp}`);
      }
    }
  }

  return res.json({
    success: true,
    requireLoginOtp: true,
    devOtp: process.env.SHOW_DEV_OTPS === 'true' ? otp : undefined,
    message: 'Password valid. Please enter the OTP sent to your email/phone.'
  });
});

otpApp.post('/api/verify-login-otp', (req, res) => {
  const { otp } = req.body;
  if (!req.session.pendingLoginIdentifier) {
    return res.status(400).json({ error: 'No pending login.' });
  }

  if (!req.session.loginOtp || req.session.loginOtp !== otp) {
    return res.status(400).json({ error: 'Invalid OTP.' });
  }

  req.session.loginOtpVerified = true;
  req.session.loginOtp = null;

  return res.json({
    success: true,
    requireCaptcha: true,
    captchaUrl: `http://localhost:${PORT_CAPTCHA}/`,
    message: 'OTP verified. Continue with CAPTCHA.'
  });
});

otpApp.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

otpApp.get('/api/me', (req, res) => {
  if (req.session.loggedInUser) return res.json({ user: req.session.loggedInUser });
  return res.status(401).json({ error: 'Not logged in.' });
});

// =====================================================================================
// CAPTCHA server (5000): login CAPTCHA only
// =====================================================================================
const captchaApp = buildAppBase({
  staticDir: path.join(__dirname, 'servers', 'captcha-server', 'public'),
  allowOrigins: [`http://localhost:${PORT_OTP}`, `http://localhost:${PORT_CAPTCHA}`, `http://localhost:${PORT_MFA}`]
});

captchaApp.get('/api/captcha', (req, res) => {
  if (!req.session.loginOtpVerified || !req.session.pendingLoginIdentifier) {
    return res.status(401).json({ error: 'OTP step not completed yet.' });
  }

  const captcha = svgCaptcha.create({
    size: 5,
    noise: 3,
    color: true,
    background: '#f0f0f0'
  });
  req.session.loginCaptchaText = captcha.text;
  return res.json({
    success: true,
    captchaSvg: captcha.data,
    devCaptchaText: process.env.SHOW_DEV_CAPTCHA === 'true' ? captcha.text : undefined
  });
});

captchaApp.post('/api/verify-captcha', (req, res) => {
  const { captchaAnswer } = req.body;

  if (!req.session.loginOtpVerified || !req.session.pendingLoginIdentifier) {
    return res.status(401).json({ error: 'OTP step not completed yet.' });
  }

  const expected = req.session.loginCaptchaText;
  if (!expected || expected.toLowerCase() !== String(captchaAnswer || '').toLowerCase()) {
    return res.status(400).json({ error: 'Incorrect CAPTCHA. Please try again.' });
  }

  req.session.loginCaptchaText = null;
  req.session.captchaVerified = true;

  return res.json({
    success: true,
    requireMfa: true,
    mfaUrl: `http://localhost:${PORT_MFA}/`,
    message: 'CAPTCHA verified. Continue with MFA.'
  });
});

captchaApp.get('/health', (req, res) => res.json({ ok: true, service: 'captcha', port: PORT_CAPTCHA }));

// =====================================================================================
// MFA server (8000): verifies TOTP and finalizes session
// =====================================================================================
const mfaApp = buildAppBase({
  staticDir: path.join(__dirname, 'servers', 'mfa-server', 'public'),
  allowOrigins: [`http://localhost:${PORT_OTP}`, `http://localhost:${PORT_CAPTCHA}`, `http://localhost:${PORT_MFA}`]
});

mfaApp.post('/api/verify-mfa', (req, res) => {
  const { mfaCode } = req.body;

  if (!req.session.pendingLoginIdentifier || !req.session.loginOtpVerified || !req.session.captchaVerified) {
    return res.status(401).json({ error: 'Previous steps not completed yet.' });
  }

  const identifier = req.session.pendingLoginIdentifier;
  const user = users.get(identifier);
  if (!user) return res.status(400).json({ error: 'User not found.' });

  const isValid = authenticator.check(mfaCode, user.totpSecret);
  if (!isValid) return res.status(401).json({ error: 'Invalid Authenticator code.' });

  req.session.loggedInUser = { name: user.name, email: user.email, phone: user.phone };

  // Clear pending login state
  req.session.pendingLoginIdentifier = null;
  req.session.loginOtpVerified = false;
  req.session.captchaVerified = false;

  return res.json({
    success: true,
    user: req.session.loggedInUser,
    dashboardUrl: `http://localhost:${PORT_OTP}/`
  });
});

mfaApp.get('/health', (req, res) => res.json({ ok: true, service: 'mfa', port: PORT_MFA }));

// =====================================================================================
// Boot all three
// =====================================================================================
function listenOrExit(app, port, name) {
  const server = app.listen(port, () => {
    console.log(`${name} server running at http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`❌ ${name} port ${port} is already in use.`);
      console.error(`   Fix: stop the process using :${port}, or run with different ports:`);
      console.error(`   OTP_PORT=3100 CAPTCHA_PORT=5100 MFA_PORT=8100 npm run start:multi`);
      process.exit(1);
    }
    throw err;
  });
}

listenOrExit(otpApp, PORT_OTP, 'OTP');
listenOrExit(captchaApp, PORT_CAPTCHA, 'CAPTCHA');
listenOrExit(mfaApp, PORT_MFA, 'MFA');

