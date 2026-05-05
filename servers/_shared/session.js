const session = require('express-session');

function createSessionMiddleware() {
  return session({
    name: process.env.SESSION_COOKIE_NAME || 'connect.sid',
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax'
    }
  });
}

module.exports = { createSessionMiddleware };

