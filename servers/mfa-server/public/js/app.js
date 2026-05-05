const errorEl = document.getElementById('error');
const successEl = document.getElementById('success');

const tabRegister = document.getElementById('tabRegister');
const tabLogin = document.getElementById('tabLogin');

const registerSection = document.getElementById('registerSection');
const setupSection = document.getElementById('setupSection');
const loginSection = document.getElementById('loginSection');

const qrImg = document.getElementById('qrImg');
const secretText = document.getElementById('secretText');

const loginMfaForm = document.getElementById('loginMfaForm');

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
  setupSection.style.display = 'none';
  loginSection.style.display = 'none';
}

function showLogin() {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  registerSection.style.display = 'none';
  setupSection.style.display = 'none';
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
    qrImg.src = data.qrCodeUrl;
    secretText.textContent = `Manual code: ${data.secret}`;
    registerSection.style.display = 'none';
    setupSection.style.display = '';
    showSuccess('Scan QR in Authenticator, then enter the 6-digit code to finish.');
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('verifySetupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const mfaCode = document.getElementById('setupCode').value;
    await api('/api/verify-mfa', { mfaCode });
    window.location.href = '/dashboard.html';
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
    if (data.requireMfa) {
      loginMfaForm.style.display = '';
      showSuccess('Password ok. Enter Authenticator code.');
    }
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('loginMfaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const mfaCode = document.getElementById('loginMfaCode').value;
    await api('/api/login/verify-mfa', { mfaCode });
    window.location.href = '/dashboard.html';
  } catch (err) {
    showError(err.message);
  }
});

showRegister();

