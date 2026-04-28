// --- STATE MANAGEMENT ---
const state = {
    pendingIdentifier: '',
    regMethod: 'email',
    loggedInUser: null,
    calendarInitialized: false
};

// --- DOM ELEMENTS ---
const errorMsg = document.getElementById('error-message');
const successMsg = document.getElementById('success-message');

function clearMessages() {
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
    successMsg.style.display = 'none';
    successMsg.textContent = '';
}

function showError(msg) {
    clearMessages();
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
}

function showSuccess(msg) {
    clearMessages();
    successMsg.textContent = msg;
    successMsg.style.display = 'block';
}

function switchView(viewId) {
    clearMessages();
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById(viewId).classList.add('active');

    // Toggle between auth card and full dashboard
    const authContainer = document.querySelector('.container');
    const fullDashboard = document.getElementById('full-dashboard');
    if (viewId === 'view-dashboard') {
        authContainer.style.display = 'none';
        fullDashboard.style.display = 'block';
    } else {
        authContainer.style.display = '';
        fullDashboard.style.display = 'none';
    }
}

// --- REGISTRATION METHOD TOGGLE ---
function setRegMethod(method) {
    state.regMethod = method;
    const emailField = document.getElementById('email-field');
    const phoneField = document.getElementById('phone-field');
    const emailBtn = document.getElementById('btn-method-email');
    const phoneBtn = document.getElementById('btn-method-phone');

    if (method === 'phone') {
        emailField.style.display = 'none';
        phoneField.style.display = 'block';
        document.getElementById('reg-email').removeAttribute('required');
        document.getElementById('reg-phone').setAttribute('required', 'true');
        emailBtn.style.background = '#fff';
        emailBtn.style.color = '#6c63ff';
        phoneBtn.style.background = '#6c63ff';
        phoneBtn.style.color = '#fff';
    } else {
        emailField.style.display = 'block';
        phoneField.style.display = 'none';
        document.getElementById('reg-email').setAttribute('required', 'true');
        document.getElementById('reg-phone').removeAttribute('required');
        emailBtn.style.background = '#6c63ff';
        emailBtn.style.color = '#fff';
        phoneBtn.style.background = '#fff';
        phoneBtn.style.color = '#6c63ff';
    }
}

// --- API HELPERS ---
async function apiCall(url, data) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'Server error');
    }
    return result;
}

// --- EVENT LISTENERS ---

// 1. REGISTRATION FORM SUBMIT
document.getElementById('form-register').addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const method = state.regMethod;

    if (password !== confirm) {
        showError("Passwords do not match.");
        return;
    }

    if (method === 'phone' && !phone) {
        showError("Please enter your phone number.");
        return;
    }
    if (method === 'email' && !email) {
        showError("Please enter your email address.");
        return;
    }

    const btn = document.getElementById('btn-register-submit');
    btn.textContent = method === 'phone' ? 'Sending SMS...' : 'Sending Email...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/register', { name, email, phone, password, method });
        state.pendingIdentifier = data.identifier;
        document.getElementById('reg-otp-input').value = '';
        switchView('view-register-otp');
        showSuccess(method === 'phone'
            ? "Verification SMS has been sent to your phone."
            : "Verification email has been sent to your inbox.");
    } catch (err) {
        showError(err.message);
    } finally {
        btn.textContent = 'Register';
        btn.disabled = false;
    }
});

// 2. REGISTRATION OTP SUBMIT (VERIFY OTP)
document.getElementById('form-register-otp').addEventListener('submit', async function (e) {
    e.preventDefault();
    const otp = document.getElementById('reg-otp-input').value;
    const btn = document.getElementById('btn-reg-otp-verify');

    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/verify-email', { identifier: state.pendingIdentifier, otp });

        if (data.requireCaptcha) {
            await loadCaptcha();
            switchView('view-captcha');
            showSuccess(data.message);
        }
    } catch (err) {
        showError(err.message);
    } finally {
        btn.textContent = 'Verify OTP';
        btn.disabled = false;
    }
});

// 2.5 CAPTCHA HELPERS
async function loadCaptcha() {
    try {
        const response = await fetch('/api/captcha');
        const data = await response.json();
        document.getElementById('captcha-image').innerHTML = data.captchaSvg;
        document.getElementById('captcha-input').value = '';
    } catch (err) {
        showError('Failed to load CAPTCHA.');
    }
}

// REFRESH CAPTCHA
document.getElementById('btn-refresh-captcha').addEventListener('click', async function () {
    await loadCaptcha();
    showSuccess('New CAPTCHA loaded.');
});

// CAPTCHA FORM SUBMIT
document.getElementById('form-captcha').addEventListener('submit', async function (e) {
    e.preventDefault();
    const captchaAnswer = document.getElementById('captcha-input').value;
    const btn = document.getElementById('btn-captcha-verify');

    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/verify-captcha', { identifier: state.pendingIdentifier, captchaAnswer });

        // Show MFA QR Code Setup Page
        document.getElementById('mfa-qr-code').src = data.qrCodeUrl;
        document.getElementById('mfa-secret-text').textContent = 'Manual Code: ' + data.secret;
        switchView('view-setup-mfa');
        showSuccess(data.message);

        // Pre-fill login for convenience
        document.getElementById('login-email').value = state.pendingIdentifier;
    } catch (err) {
        showError(err.message);
        await loadCaptcha();
    } finally {
        btn.textContent = 'Verify CAPTCHA';
        btn.disabled = false;
    }
});

// 3. LOGIN FORM SUBMIT
document.getElementById('form-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    const identifier = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login-submit');

    btn.textContent = 'Authenticating...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/login', { identifier, password });
        if (data.requireMfa) {
            state.pendingIdentifier = identifier;
            document.getElementById('mfa-otp-input').value = '';
            switchView('view-mfa');
            showSuccess("Password valid. Please enter Authenticator code.");
        }
    } catch (err) {
        showError(err.message);
    } finally {
        btn.textContent = 'Log In';
        btn.disabled = false;
    }
});

// 4. MFA OTP SUBMIT
document.getElementById('form-mfa').addEventListener('submit', async function (e) {
    e.preventDefault();
    const mfaCode = document.getElementById('mfa-otp-input').value;
    const btn = document.getElementById('btn-mfa-verify');

    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/verify-mfa', { identifier: state.pendingIdentifier, mfaCode });

        // Successful Login
        state.loggedInUser = data.user;
        populateDashboard(data.user);
        switchView('view-dashboard');
    } catch (err) {
        showError(err.message);
    } finally {
        btn.textContent = 'Verify & Log In';
        btn.disabled = false;
    }
});

// 5. LOGOUT
document.getElementById('btn-logout').addEventListener('click', async function () {
    try {
        await apiCall('/api/logout', {});
        state.loggedInUser = null;
        document.getElementById('form-login').reset();
        document.getElementById('form-register').reset();

        // Retain identifier
        if (state.pendingIdentifier) {
            document.getElementById('login-email').value = state.pendingIdentifier;
        }

        switchView('view-login');
        showSuccess("Logged out successfully.");
    } catch (err) {
        console.error('Logout error:', err);
    }
});


function populateDashboard(user) {
    document.getElementById('dash-welcome').textContent = `✅ स्वागतम्, ${user.name}!`;
    document.getElementById('dash-name').textContent = user.name;
    document.getElementById('dash-email').textContent = user.email || user.phone || '';
    document.getElementById('dash-avatar').textContent = user.name.charAt(0).toUpperCase();

    // Initialize Nepali calendar
    if (!state.calendarInitialized) {
        NepaliCalendar.init();
        state.calendarInitialized = true;
    }
}

// Check session on load via /api/me
window.addEventListener('load', async function () {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const data = await response.json();
            state.loggedInUser = data.user;
            state.pendingIdentifier = data.user.email || data.user.phone;
            populateDashboard(data.user);
            switchView('view-dashboard');
        }
    } catch (e) {
        // Not logged in, stay on register/login
    }
});
