const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const express = require('express');
const svgCaptcha = require('svg-captcha');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../../swagger.json');
const { createStores } = require('../_shared/auth-store');
const { createSessionMiddleware } = require('../_shared/session');

const PORT = 3000;
const app = express();

const { users, pending } = createStores();

app.use(express.json());
app.use(createSessionMiddleware());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.post('/api/register', (req, res) => {
  const { name, email, phone, password, method } = req.body;
  const identifier = method === 'phone' ? phone : email;
  if (!identifier) return res.status(400).json({ error: 'Missing identifier.' });
  if (!password) return res.status(400).json({ error: 'Missing password.' });
  if (users.has(identifier)) return res.status(400).json({ error: 'Already registered.' });

  pending.set(identifier, { name: name || '', email: email || '', phone: phone || '', password, method });
  req.session.pendingIdentifier = identifier;

  // Generate captcha for this registration session
  const captcha = svgCaptcha.create({ size: 5, noise: 3, color: true, background: '#f0f0f0' });
  req.session.captchaText = captcha.text;

  // Expose captcha for QA automation (Only acceptable in non-prod environments)
  res.setHeader('x-e2e-captcha', captcha.text);

  return res.json({ success: true, identifier, captchaSvg: captcha.data });
});

app.get('/api/captcha', (req, res) => {
  const captcha = svgCaptcha.create({ size: 5, noise: 3, color: true, background: '#f0f0f0' });
  req.session.captchaText = captcha.text;
  res.setHeader('x-e2e-captcha', captcha.text);
  return res.json({ success: true, captchaSvg: captcha.data });
});

app.post('/api/verify-captcha', (req, res) => {
  const { identifier, captchaAnswer } = req.body;
  const pendingId = identifier || req.session.pendingIdentifier;
  const p = pending.get(pendingId);
  if (!p) return res.status(400).json({ error: 'No pending registration.' });

  const expected = req.session.captchaText;
  if (!expected || expected.toLowerCase() !== String(captchaAnswer || '').toLowerCase()) {
    return res.status(400).json({ error: 'Incorrect CAPTCHA.' });
  }

  const user = { name: p.name, email: p.email, phone: p.phone, password: p.password };
  users.set(pendingId, user);
  pending.delete(pendingId);
  req.session.pendingIdentifier = null;
  req.session.captchaText = null;

  req.session.loggedInUser = { name: user.name, email: user.email, phone: user.phone };
  return res.json({ success: true, user: req.session.loggedInUser });
});

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
  console.log(`CAPTCHA-only server running at http://localhost:${PORT}`);
});

