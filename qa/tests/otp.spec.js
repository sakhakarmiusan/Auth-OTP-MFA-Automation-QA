const { test, expect } = require('@playwright/test');
const { getOTPFromGmail } = require('../page/emailHelper');

console.log('TEST EMAIL:', process.env.GMAIL_USER);

// test Gmail address
const TEST_EMAIL = process.env.GMAIL_USER;

test.describe('OTP Verification Tests', () => {

    test('should login successfully using email OTP', async ({ page }) => {

        await page.goto('/');
        console.log('Opened Register page');

        await page.fill('#reg-name', "test-user");
        console.log('Filled name');

        await page.fill('#reg-email', process.env.GMAIL_USER);
        console.log('Filled email');

        await page.fill('#reg-password', "Test12345");
        console.log('Filled password');

        await page.fill('#reg-confirm', "Test12345");
        console.log('Filled confirm password');

        await page.click('#btn-register-submit');
        console.log('Clicked Send OTP button');

        //Wait for OTP input field to appear
        await page.waitForSelector('#reg-otp-input', { timeout: 15000 });
        console.log('OTP input field appeared');

        //Read OTP from Gmail
        const otp = await getOTPFromGmail(TEST_EMAIL);
        console.log('Got OTP from Gmail:', otp);

        //Type OTP into the input field
        await page.fill('#reg-otp-input', otp);
        console.log('Filled OTP into input field');
        await page.waitForTimeout(5000);

        //Click Verify email button
        await page.click('#btn-reg-otp-verify');
        console.log('Clicked Verify button');

        // Step 8: Check if redirected to captcha
        await page.waitForSelector("div[id='view-captcha'] h2", { timeout: 15000 });
        console.log('Captcha field visible');
    });
});