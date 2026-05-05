const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const express = require('express');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

const { createStores } = require('../_shared/auth-store');
const { createSessionMiddleware } = require('../_shared/session');

const PORT = Number(process.env.MFA_PORT || process.env.PORT || 8000);
const app = express();

const { users, pending } = createStores();

app.use(express.json());
app.use(createSessionMiddleware());
app.use(express.static(path.join(__dirname, 'public')));

// Register -> create secret + show QR; user must verify one TOTP code to finish and reach dashboard
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password, method } = req.body;
  const identifier = method === 'phone' ? phone : email;
  if (!identifier) return res.status(400).json({ error: 'Missing identifier.' });
  if (!password) return res.status(400).json({ error: 'Missing password.' });
  if (users.has(identifier)) return res.status(400).json({ error: 'Already registered.' });

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(identifier, 'SecureAuthApp', secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauth);

  pending.set(identifier, { name: name || '', email: email || '', phone: phone || '', password, method, secret });
  req.session.pendingIdentifier = identifier;

  return res.json({ success: true, identifier, qrCodeUrl, secret });
});

// Verify TOTP during registration -> finalize user + login (dashboard)
app.post('/api/verify-mfa', (req, res) => {
  const { identifier, mfaCode } = req.body;
  const pendingId = identifier || req.session.pendingIdentifier;
  const p = pending.get(pendingId);
  if (!p) return res.status(400).json({ error: 'No pending registration.' });

  const ok = authenticator.check(String(mfaCode || ''), p.secret);
  if (!ok) return res.status(401).json({ error: 'Invalid Authenticator code.' });

  const user = { name: p.name, email: p.email, phone: p.phone, password: p.password, totpSecret: p.secret };
  users.set(pendingId, user);
  pending.delete(pendingId);
  req.session.pendingIdentifier = null;

  req.session.loggedInUser = { name: user.name, email: user.email, phone: user.phone };
  return res.json({ success: true, user: req.session.loggedInUser });
});

// Login -> requires TOTP every time (this is the MFA-only mode)
app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;
  const user = users.get(identifier);
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials.' });
  req.session.pendingLoginIdentifier = identifier;
  return res.json({ success: true, requireMfa: true });
});

app.post('/api/login/verify-mfa', (req, res) => {
  const { mfaCode } = req.body;
  const identifier = req.session.pendingLoginIdentifier;
  if (!identifier) return res.status(400).json({ error: 'No pending login.' });
  const user = users.get(identifier);
  if (!user) return res.status(400).json({ error: 'User not found.' });

  const ok = authenticator.check(String(mfaCode || ''), user.totpSecret);
  if (!ok) return res.status(401).json({ error: 'Invalid Authenticator code.' });

  req.session.pendingLoginIdentifier = null;
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
  console.log(`MFA-only server running at http://localhost:${PORT}`);
});

