const axios = require('axios');
const BASE_URL = process.env.APP_URL;



// ─────────────────────────────────────────
// This function does 2 things:
// 1. Calls register API → account created
// 2. Gets session cookie from response
// No login needed → No captcha needed ✅
// ─────────────────────────────────────────
async function registerAndBypass() {

  // Create unique email every test run
  // So we don't get "email already exists" error
  const uniqueEmail = `testuser_${Date.now()}@gmail.com`;
  console.log('📧 Using email:', uniqueEmail);

  console.log('📝 Calling register API...');

  // Call register API directly
  // This skips the UI completely
  // So captcha page never appears ✅
  const response = await axios.post(

    // Your register endpoint
    `${BASE_URL}/api/register`,

    // Request body — same fields your register form sends
    {
      name: 'Test User',
      email: uniqueEmail,
      password: process.env.TEST_PASSWORD,
      phone: '',
      method: 'email'
    },

    // Axios options
    {
      withCredentials: true, // important — tells axios to handle cookies
      maxRedirects: 0,       // don't follow redirects — we need the cookie
      validateStatus: (status) => status < 500 // don't throw error on 3xx/4xx
    }
  );

  console.log('✅ Register API called successfully');
  // Extract cookie to maintain session and captcha answer from headers
  let initialCookies = response.headers['set-cookie'];
  let cookieHeader = initialCookies ? initialCookies.map(c => c.split(';')[0]).join('; ') : '';
  let actualCaptchaAnswer = response.headers['x-e2e-captcha'];

  console.log('🔑 Calling verify-captcha API with dynamically extracted answer: ' + actualCaptchaAnswer);
  let verifyResponse;
  try {
    verifyResponse = await axios.post(
      `${BASE_URL}/api/verify-captcha`,
      {
        identifier: uniqueEmail,
        captchaAnswer: actualCaptchaAnswer
      },
      {
        headers: { Cookie: cookieHeader },
        withCredentials: true
      }
    );
  } catch (error) {
    console.error('verify-captcha failed:', error.response?.data);
    throw error;
  }

  console.log('✅ Captcha bypassed and logged in!');

  // The session cookie might be updated
  const finalCookies = verifyResponse.headers['set-cookie'] || response.headers['set-cookie'];
  console.log('Cookies from response:', finalCookies);

  // Get cookies from response headers
  const cookies = finalCookies;

  // If no cookie in response — throw error
  if (!cookies) {
    throw new Error('❌ No cookie returned from register API — check your backend');
  }

  // Parse cookies into array of objects
  // Playwright needs cookies in this format
  const parsedCookies = cookies.map(cookieStr => {

    // Cookie string looks like:
    // "connect.sid=s%3Axxx; Path=/; HttpOnly; SameSite=Lax"
    // We split by ; to get each part
    const parts = cookieStr.split(';').map(p => p.trim());

    // First part is name=value
    const [nameValue] = parts;
    const eqIndex = nameValue.indexOf('=');
    const name = nameValue.substring(0, eqIndex).trim();   // connect.sid
    const value = nameValue.substring(eqIndex + 1).trim(); // s%3Axxx

    // Check if HttpOnly flag exists
    const httpOnly = parts.some(p => p.toLowerCase() === 'httponly');

    // Check if Secure flag exists
    const secure = parts.some(p => p.toLowerCase() === 'secure');

    return {
      name,            // cookie name → connect.sid
      value,           // cookie value → s%3Axxx
      path: '/',       // cookie path
      httpOnly,        // true or false
      secure,          // true or false
      sameSite: 'Lax', // sameSite value
    };
  });

  console.log('✅ Cookies parsed successfully:', parsedCookies.map(c => c.name));
  return parsedCookies;
}

// Export so test file can use it
// module.exports = { registerAndBypass };





// ─────────────────────────────
// Parse cookies from response
// ─────────────────────────────
function parseCookies(response) {
  const cookies = response.headers['set-cookie'];

  if (!cookies) {
    throw new Error('❌ No cookies found in response');
  }

  return cookies.map(cookieStr => {
    const parts = cookieStr.split(';').map(p => p.trim());
    const [nameValue] = parts;
    const eqIndex = nameValue.indexOf('=');
    const name = nameValue.substring(0, eqIndex).trim();
    const value = nameValue.substring(eqIndex + 1).trim();
    const httpOnly = parts.some(p => p.toLowerCase() === 'httponly');
    const secure = parts.some(p => p.toLowerCase() === 'secure');
    const pathPart = parts.find(p => p.toLowerCase().startsWith('path='));
    const path = pathPart ? pathPart.split('=')[1] : '/';

    return { name, value, path, httpOnly, secure, sameSite: 'Lax' };
  });
}

// ─────────────────────────────
// STEP 1: Register new account
// ─────────────────────────────
async function register(email) {
  console.log('📝 Step 1: Registering account via API...');

  const response = await axios.post(
    `${BASE_URL}/api/register`,
    {
      name: 'Test User',
      email: email,
      password: process.env.TEST_PASSWORD,
      phone: '',
      method: 'email'
    },
    {
      withCredentials: true,
      maxRedirects: 0,
      validateStatus: (status) => status < 500
    }
  );

  console.log('✅ Account created — register captcha bypassed!');

  // Extract cookie to maintain session and captcha answer
  let cookies = response.headers['set-cookie'];
  let cookieHeader = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';
  let actualCaptchaAnswer = response.headers['x-e2e-captcha'];

  console.log('🔑 Step 2: Verifying captcha with dynamically extracted answer: ' + actualCaptchaAnswer);
  const verifyResponse = await axios.post(
    `${BASE_URL}/api/verify-captcha`,
    {
      identifier: email,
      captchaAnswer: actualCaptchaAnswer
    },
    {
      headers: { Cookie: cookieHeader },
      withCredentials: true
    }
  );

  console.log('✅ Captcha verified and logged in!');

  // The session cookie might be updated, so parse from verifyResponse if present, else original
  const finalCookies = verifyResponse.headers['set-cookie'] || response.headers['set-cookie'];
  return parseCookies({ headers: { 'set-cookie': finalCookies } });
}

// ─────────────────────────────
// STEP 2: Login with same email (Deprecated, handled in verify-captcha)
// ─────────────────────────────
async function login(email) {
  // Not needed for captcha-server, verify-captcha logs us in
}

// ─────────────────────────────
// MAIN: Register then Login
// ─────────────────────────────
async function registerThenLogin() {
  // Generate unique email every test run
  const uniqueEmail = `testuser_${Date.now()}@gmail.com`;
  console.log('📧 Using email:', uniqueEmail);

  // Step 1: Register & verify captcha (which also logs in)
  const cookies = await register(uniqueEmail);
  return cookies;
}

// ─────────────────────────────
// ONLY Login (existing account)
// ─────────────────────────────
async function loginOnly() {
  console.log('🔑 Login only via API...');

  const response = await axios.post(
    `${BASE_URL}/api/login`,
    {
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    }
  );

  console.log('✅ Logged in — captcha bypassed!');
  return parseCookies(response);
}

module.exports = { registerThenLogin, loginOnly, registerAndBypass };