const errorEl = document.getElementById('error');
const successEl = document.getElementById('success');

const authCard = document.getElementById('authCard');
const dashboard = document.getElementById('dashboard');

const tabRegister = document.getElementById('tabRegister');
const tabLogin = document.getElementById('tabLogin');
const registerSection = document.getElementById('registerSection');
const otpSection = document.getElementById('otpSection');
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

function showRegister() {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerSection.style.display = '';
  otpSection.style.display = 'none';
  loginSection.style.display = 'none';
}

function showLogin() {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  registerSection.style.display = 'none';
  otpSection.style.display = 'none';
  loginSection.style.display = '';
}

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

function populateDashboard(user) {
  document.getElementById('dash-name').textContent = user.name || '';
  document.getElementById('dash-email').textContent = user.email || user.phone || '';
  document.getElementById('dash-avatar').textContent = (user.name || 'U').charAt(0).toUpperCase();
  document.getElementById('dash-welcome').textContent = `✅ स्वागतम्, ${user.name || ''}!`;
  NepaliCalendar.init();
}

function goDashboard(user) {
  authCard.style.display = 'none';
  dashboard.style.display = 'block';
  populateDashboard(user);
}

tabRegister.addEventListener('click', showRegister);
tabLogin.addEventListener('click', showLogin);

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const data = await api('/api/register', { name, email, password, phone: '', method: 'email' });
    pendingIdentifier = data.identifier;
    registerSection.style.display = 'none';
    otpSection.style.display = '';
    showSuccess(data.message || 'OTP sent. Enter it to continue.');
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('otpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const otp = document.getElementById('otpInput').value;
    const data = await api('/api/verify-otp', { identifier: pendingIdentifier, otp });
    goDashboard(data.user);
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const identifier = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const data = await api('/api/login', { identifier, password });
    goDashboard(data.user);
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await api('/api/logout', {});
    dashboard.style.display = 'none';
    authCard.style.display = 'block';
    pendingIdentifier = '';
    showRegister();
    showSuccess('Logged out.');
  } catch (e) {
    showError('Logout failed');
  }
});

(async () => {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    goDashboard(data.user);
  } catch {
    // ignore
  }
})();

