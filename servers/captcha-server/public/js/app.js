const errorEl = document.getElementById('error');
const successEl = document.getElementById('success');
const captchaImageEl = document.getElementById('captchaImage');
const captchaAnswerEl = document.getElementById('captchaAnswer');
const submitBtn = document.getElementById('submitBtn');

const tabRegister = document.getElementById('tabRegister');
const tabLogin = document.getElementById('tabLogin');
const registerSection = document.getElementById('registerSection');
const captchaSection = document.getElementById('captchaSection');
const loginSection = document.getElementById('loginSection');

let pendingIdentifier = '';

function showError(msg) {
  successEl.style.display = 'none';
  successEl.textContent = '';
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
}

function showSuccess(msg) {
  errorEl.style.display = 'none';
  errorEl.textContent = '';
  successEl.textContent = msg;
  successEl.style.display = 'block';
}

async function loadCaptcha() {
  try {
    const res = await fetch('/api/captcha', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load CAPTCHA');
    captchaImageEl.innerHTML = data.captchaSvg;
    captchaAnswerEl.value = '';
  } catch (e) {
    showError(e.message);
  }
}

function showRegister() {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerSection.style.display = '';
  captchaSection.style.display = 'none';
  loginSection.style.display = 'none';
}

function showLogin() {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  registerSection.style.display = 'none';
  captchaSection.style.display = 'none';
  loginSection.style.display = '';
}

tabRegister.addEventListener('click', showRegister);
tabLogin.addEventListener('click', showLogin);

async function api(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const data = await api('/api/register', { name, email, password, phone: '', method: 'email' });
    pendingIdentifier = data.identifier;
    captchaSection.style.display = '';
    registerSection.style.display = 'none';
    captchaImageEl.innerHTML = data.captchaSvg;
    showSuccess('Registered. Now solve the CAPTCHA to finish and open dashboard.');
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('refreshBtn').addEventListener('click', async () => {
  await loadCaptcha();
});

document.getElementById('captchaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying...';
  try {
    const captchaAnswer = captchaAnswerEl.value;
    const data = await api('/api/verify-captcha', { identifier: pendingIdentifier, captchaAnswer });
    showSuccess('CAPTCHA verified. Redirecting to dashboard…');
    window.location.href = '/dashboard.html';
  } catch (e2) {
    showError(e2.message);
    await loadCaptcha();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verify CAPTCHA';
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const identifier = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    await api('/api/login', { identifier, password });
    window.location.href = '/dashboard.html';
  } catch (err) {
    showError(err.message);
  }
});

showRegister();

