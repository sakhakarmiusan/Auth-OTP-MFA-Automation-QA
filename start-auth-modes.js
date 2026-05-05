const { spawn } = require('child_process');
const path = require('path');

function run(name, scriptPath, env) {
  const child = spawn(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      // eslint-disable-next-line no-console
      console.error(`\n${name} exited with code ${code}`);
    }
  });
  return child;
}

const root = __dirname;
const otpScript = path.join(root, 'servers', 'otp-server', 'server.js');
const captchaScript = path.join(root, 'servers', 'captcha-server', 'server.js');
const mfaScript = path.join(root, 'servers', 'mfa-server', 'server.js');

run('OTP', otpScript, { PORT: process.env.OTP_PORT || '3000' });
run('CAPTCHA', captchaScript, { PORT: process.env.CAPTCHA_PORT || '5000' });
run('MFA', mfaScript, { PORT: process.env.MFA_PORT || '8000' });

