import { test, expect } from '@playwright/test';
import { getOTPFromGmail } from '../pages/emailOTP';

const TEST_EMAIL = process.env.GMAIL_USER;

test.describe('OTP Verification Tests', () => {

    test('should login successfully using email OTP', async ({ page }) => {

        await page.goto('/login');
        console.log('🌐 Opened login page');

        await page.fill('#email', TEST_EMAIL);
        console.log('✏️ Filled email:', TEST_EMAIL);

        await page.click('#send-otp');
        console.log('📤 Clicked Send OTP button');

        await page.waitForSelector('#otp-input', { timeout: 15000 });
        console.log('👁️ OTP input field appeared');

        // Step 5: Read OTP from Gmail automatically
        const otp = await getOTPFromGmail(TEST_EMAIL);
        console.log('🔑 Got OTP from Gmail:', otp);

        // Step 6: Type OTP into the input field
        await page.fill('#otp-input', otp);
        console.log('✏️ Filled OTP into input field');

        // Step 7: Click Verify button
        await page.click('#verify-btn');
        console.log('🖱️ Clicked Verify button');

        // Step 8: Check if redirected to dashboard
        await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
        console.log('✅ Successfully redirected to dashboard!');
    });


});