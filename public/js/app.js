// --- STATE MANAGEMENT ---
const state = {
    pendingEmail: '',
    loggedInUser: null
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
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (password !== confirm) {
        showError("Passwords do not match.");
        return;
    }

    const btn = document.getElementById('btn-register-submit');
    btn.textContent = 'Sending Email...';
    btn.disabled = true;

    try {
        await apiCall('/api/register', { name, email, password });
        state.pendingEmail = email;
        document.getElementById('reg-otp-input').value = '';
        switchView('view-register-otp');
        showSuccess("Verification email has been sent to your inbox.");
    } catch (err) {
        showError(err.message);
    } finally {
        btn.textContent = 'Register';
        btn.disabled = false;
    }
});

// 2. REGISTRATION OTP SUBMIT (VERIFY EMAIL)
document.getElementById('form-register-otp').addEventListener('submit', async function (e) {
    e.preventDefault();
    const otp = document.getElementById('reg-otp-input').value;
    const btn = document.getElementById('btn-reg-otp-verify');

    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/verify-email', { email: state.pendingEmail, otp });

        // Show MFA QR Code Setup Page
        document.getElementById('mfa-qr-code').src = data.qrCodeUrl;
        document.getElementById('mfa-secret-text').textContent = 'Manual Code: ' + data.secret;
        switchView('view-setup-mfa');
        showSuccess(data.message);

        // Pre-fill login for convenience
        document.getElementById('login-email').value = state.pendingEmail;
    } catch (err) {
        showError(err.message);
    } finally {
        btn.textContent = 'Verify Email';
        btn.disabled = false;
    }
});

// 3. LOGIN FORM SUBMIT
document.getElementById('form-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login-submit');

    btn.textContent = 'Authenticating...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/login', { email, password });
        if (data.requireMfa) {
            state.pendingEmail = email;
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
        const data = await apiCall('/api/verify-mfa', { email: state.pendingEmail, mfaCode });

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

        // Retain email
        if (state.pendingEmail) {
            document.getElementById('login-email').value = state.pendingEmail;
        }

        switchView('view-login');
        showSuccess("Logged out successfully.");
    } catch (err) {
        console.error('Logout error:', err);
    }
});

function populateDashboard(user) {
    document.getElementById('dash-welcome').textContent = `✅ Login Successful — Welcome, ${user.name}!`;
    document.getElementById('dash-name').textContent = user.name;
    document.getElementById('dash-email').textContent = user.email;
    document.getElementById('dash-avatar').textContent = user.name.charAt(0).toUpperCase();
}

// Check session on load via /api/me
window.addEventListener('load', async function () {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const data = await response.json();
            state.loggedInUser = data.user;
            state.pendingEmail = data.user.email;
            populateDashboard(data.user);
            switchView('view-dashboard');
        }
    } catch (e) {
        // Not logged in, stay on register/login
    }
});
