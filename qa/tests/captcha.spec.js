const { test, expect } = require('@playwright/test');
const { registerAndBypass, registerThenLogin, loginOnly } = require('../page/captchaHelper');

// ─────────────────────────────
// Helper — set cookie in browser
// and go to dashboard
// ─────────────────────────────
async function setSessionAndGo(page, cookies) {
  await page.goto('/');

  await page.context().addCookies(
    cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: 'localhost',
      path: cookie.path || '/',
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite, //lax
    }))
  );

  console.log('✅ Cookie set in browser');

  // Skip login + captcha + register pages
  // Go straight to dashboard ✅
  await page.goto('/dashboard.html');
  console.log('✅ On dashboard!');
}

// ─────────────────────────────────────────
// TEST SUITE 1
// Register → Login → Dashboard
// Both captchas bypassed ✅
// ─────────────────────────────────────────
test.describe('Register then Login — Both Captchas Bypassed', () => {

  let cookies = null;

  test.beforeAll(async () => {
    console.log('🚀 Starting Register → Login bypass...');

    // Step 1: Register via API (captcha bypassed)
    // Step 2: Login via API (captcha bypassed)
    // Step 3: Get session cookie
    cookies = await registerAndBypass();

    console.log('✅ captchas bypassed cookies ready');
  });

  test.beforeEach(async ({ page }) => {
    await setSessionAndGo(page, cookies);
  });

  // ── YOUR UI TESTS START HERE ──
  // You are on dashboard already ✅

  test('should reach dashboard after register and login', async ({ page }) => {
    await expect(page).toHaveURL('/dashboard.html');
    console.log('✅ Dashboard reached');

    await page.waitForTimeout(20000);

    await expect(page.locator('#dash-welcome')).toContainText('स्वागतम्');
    console.log('✅ Welcome text appear');
  });
});

// ─────────────────────────────────────────
// TEST SUITE 2
// Only Login → Dashboard
// Login captcha bypassed ✅
// ─────────────────────────────────────────
// test.describe('Login Only — Captcha Bypassed', () => {

//   let cookies = null;

//   test.beforeAll(async () => {
//     console.log('🚀 Starting Login bypass...');
//     cookies = await loginOnly();
//     console.log('✅ Login captcha bypassed!');
//   });

//   test.beforeEach(async ({ page }) => {
//     await setSessionAndGo(page, cookies);
//   });

//   // ── YOUR UI TESTS START HERE ──
//   // You are on dashboard already ✅

//   test('should reach dashboard after login', async ({ page }) => {
//     await expect(page).toHaveURL('/dashboard');
//     console.log('✅ Dashboard reached — login captcha bypassed!');
//   });

//   // Add more dashboard tests below ↓

// });