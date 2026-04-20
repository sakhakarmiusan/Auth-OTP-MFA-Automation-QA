const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const svgCaptcha = require('svg-captcha');

// Twilio SMS Config
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

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

// Verify email transporter on startup
const isEmailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
if (isEmailConfigured) {
    transporter.verify()
        .then(() => console.log('✅ Email transporter verified — real emails will be sent.'))
        .catch((err) => console.error('❌ Email transporter verification FAILED:', err.message));
} else {
    console.warn('⚠️  EMAIL_USER or EMAIL_PASS is not set. Running in DEV MODE — emails will be simulated (logged to console only).');
}

// Helper to generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- API ROUTES ---

app.post('/api/register', async (req, res) => {
    const { name, email, phone, password, method } = req.body;
    const identifier = method === 'phone' ? phone : email;

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
            // Send SMS OTP
            if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
                console.log(`[DEV MODE] Simulated SMS Code for ${phone}: ${otp}`);
                return res.json({ success: true, identifier, message: 'OTP logged to server console (Add Twilio config for real SMS)' });
            }

            await twilioClient.messages.create({
                body: `Your SecureAuth verification code is: ${otp}`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phone
            });
            res.json({ success: true, identifier, message: 'Verification SMS sent.' });
        } else {
            // Send Email OTP
            if (!isEmailConfigured) {
                console.log(`[DEV MODE] Simulated Email Code for ${email}: ${otp}`);
                return res.json({ success: true, identifier, message: 'OTP logged to server console (Add .env for real email)' });
            }

            // Retry logic for consistent email delivery
            const maxRetries = 3;
            let lastError = null;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await transporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: email,
                        subject: 'Your Registration Verification Code',
                        text: `Your 6-digit email verification code is: ${otp}`
                    });
                    console.log(`✅ Email sent to ${email} on attempt ${attempt}`);
                    lastError = null;
                    break;
                } catch (sendErr) {
                    lastError = sendErr;
                    console.warn(`⚠️  Email send attempt ${attempt}/${maxRetries} failed: ${sendErr.message}`);
                    if (attempt < maxRetries) {
                        await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
                    }
                }
            }

            if (lastError) {
                console.error('❌ All email send attempts failed:', lastError.message);
                return res.status(500).json({ error: 'Failed to send email after multiple attempts. Check configuration.' });
            }

            res.json({ success: true, identifier, message: 'Verification email sent.' });
        }
    } catch (err) {
        console.error('OTP send error:', err);
        res.status(500).json({ error: `Failed to send ${method === 'phone' ? 'SMS' : 'email'}. Check configuration.` });
    }
});

app.post('/api/verify-email', async (req, res) => {
    const { identifier, otp } = req.body;
    const pending = pendingUsers.get(identifier);

    if (!pending || pending.emailOtp !== otp) {
        return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    // OTP verified — mark it, but wait for CAPTCHA before generating TOTP
    pending.emailVerified = true;
    res.json({ success: true, requireCaptcha: true, message: 'OTP verified. Please complete the CAPTCHA.' });
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
    const { identifier, captchaAnswer } = req.body;
    const pending = pendingUsers.get(identifier);

    if (!pending || !pending.emailVerified) {
        return res.status(400).json({ error: 'OTP not verified yet.' });
    }

    if (!req.session.captchaText || req.session.captchaText.toLowerCase() !== captchaAnswer.toLowerCase()) {
        return res.status(400).json({ error: 'Incorrect CAPTCHA. Please try again.' });
    }

    // CAPTCHA passed — now generate TOTP secret for Authenticator
    req.session.captchaText = null;
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
    const { identifier, password } = req.body;
    const user = users.get(identifier);

    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Save pending MFA state into session
    req.session.pendingMfaIdentifier = identifier;
    res.json({ success: true, requireMfa: true });
});

app.post('/api/verify-mfa', (req, res) => {
    const { identifier, mfaCode } = req.body;
    const user = users.get(identifier);

    if (!user) {
        return res.status(400).json({ error: 'User not found.' });
    }

    const isValid = authenticator.check(mfaCode, user.totpSecret);
    if (!isValid) {
        return res.status(401).json({ error: 'Invalid Authenticator code.' });
    }

    req.session.loggedInUser = {
        name: user.name,
        email: user.email,
        phone: user.phone
    };
    req.session.pendingMfaIdentifier = null;

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
