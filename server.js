const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const svgCaptcha = require('svg-captcha');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false
}));

// In-Memory Database for testing
const users = new Map();
const pendingUsers = new Map();

// Nodemailer Config
let transporterConfig = {};

const service = (process.env.EMAIL_SERVICE || 'gmail').toLowerCase();

if (service === 'outlook' || service === 'hotmail') {
    // Outlook / Hotmail configuration
    transporterConfig = {
        host: "smtp-mail.outlook.com",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: {
            ciphers: 'SSLv3'
        }
    };
} else {
    // Default to Gmail configuration
    transporterConfig = {
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    };
}

const transporter = nodemailer.createTransport(transporterConfig);

// Helper to generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- API ROUTES ---

app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (users.has(email)) {
        return res.status(400).json({ error: 'Email already registered.' });
    }

    const emailOtp = generateOTP();

    pendingUsers.set(email, {
        name,
        email,
        password,
        emailOtp
    });

    // Attempt to send email
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.log(`[DEV MODE] Simulated Email Code for ${email}: ${emailOtp}`);
            return res.json({ success: true, message: 'OTP logged to server console (Add .env for real email)' });
        }

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Registration Verification Code',
            text: `Your 6-digit email verification code is: ${emailOtp}`
        });

        res.json({ success: true, message: 'Verification email sent.' });
    } catch (err) {
        console.error('Email error:', err);
        res.status(500).json({ error: 'Failed to send email. Check SMTP configuration.' });
    }
});

app.post('/api/verify-email', async (req, res) => {
    const { email, otp } = req.body;
    const pending = pendingUsers.get(email);

    if (!pending || pending.emailOtp !== otp) {
        return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    // Email verified — mark it, but wait for CAPTCHA before generating TOTP
    pending.emailVerified = true;
    res.json({ success: true, requireCaptcha: true, message: 'Email verified. Please complete the CAPTCHA.' });
});

// --- CAPTCHA ENDPOINTS ---

app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 5,
        noise: 3,
        color: true,
        background: '#f0f0f0'
    });
    req.session.captchaText = captcha.text;
    res.json({ success: true, captchaSvg: captcha.data });
});

app.post('/api/verify-captcha', async (req, res) => {
    const { email, captchaAnswer } = req.body;
    const pending = pendingUsers.get(email);

    if (!pending || !pending.emailVerified) {
        return res.status(400).json({ error: 'Email not verified yet.' });
    }

    if (!req.session.captchaText || req.session.captchaText.toLowerCase() !== captchaAnswer.toLowerCase()) {
        return res.status(400).json({ error: 'Incorrect CAPTCHA. Please try again.' });
    }

    // CAPTCHA passed — now generate TOTP secret for Authenticator
    req.session.captchaText = null; // Clear used captcha
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(email, 'SecureAuthApp', secret);

    try {
        const qrCodeDataUrl = await qrcode.toDataURL(otpauth);

        // Finalize user registration
        const newUser = {
            name: pending.name,
            email: pending.email,
            password: pending.password,
            totpSecret: secret
        };

        users.set(email, newUser);
        pendingUsers.delete(email);

        res.json({
            success: true,
            message: 'CAPTCHA verified! Please scan the QR code to setup your Authenticator app.',
            qrCodeUrl: qrCodeDataUrl,
            secret: secret
        });
    } catch (err) {
        res.status(500).json({ error: 'Error generating QR code.' });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.get(email);

    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Save pending MFA state into session
    req.session.pendingMfaEmail = email;
    res.json({ success: true, requireMfa: true });
});

app.post('/api/verify-mfa', (req, res) => {
    const { email, mfaCode } = req.body;
    const user = users.get(email);

    if (!user) {
        return res.status(400).json({ error: 'User not found.' });
    }

    const isValid = authenticator.check(mfaCode, user.totpSecret);
    if (!isValid) {
        return res.status(401).json({ error: 'Invalid Authenticator code.' });
    }

    // Success! Ensure user is logged in
    req.session.loggedInUser = {
        name: user.name,
        email: user.email
    };
    req.session.pendingMfaEmail = null;

    res.json({ success: true, user: req.session.loggedInUser });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    if (req.session.loggedInUser) {
        res.json({ user: req.session.loggedInUser });
    } else {
        res.status(401).json({ error: 'Not logged in.' });
    }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser.`);
});
