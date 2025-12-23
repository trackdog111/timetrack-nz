import { test, expect } from '@playwright/test';

const TEST_PASSWORD = 'test1234';
const MOBILE_URL = 'https://timetrack-mobile-v2.vercel.app';
const TEST_EMPLOYEE_EMAIL = 'trackdog111@hotmail.com';

async function loginMobile(page: any) {
  await page.goto(MOBILE_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  await page.getByPlaceholder(/email/i).fill(TEST_EMPLOYEE_EMAIL);
  await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
  await page.locator('form button:has-text("Sign In"), button[type="submit"]').click();
  
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

test.describe('Clock In/Out Flow', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: -36.8509, longitude: 174.7645 });
  });

  test('should clock in successfully', async ({ page }) => {
    await loginMobile(page);
    
    // Check if already clocked in, if so clock out first
    const clockOutButton = page.getByRole('button', { name: /clock out/i });
    if (await clockOutButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clockOutButton.click();
      await page.waitForTimeout(3000);
    }
    
    // Now clock in
    const clockInButton = page.getByRole('button', { name: /clock in/i });
    await expect(clockInButton).toBeVisible({ timeout: 10000 });
    await clockInButton.click();
    
    await page.waitForTimeout(3000);
    
    // Verify clocked in state
    await expect(page.getByRole('button', { name: /clock out/i })).toBeVisible({ timeout: 15000 });
  });

  test('should clock out successfully', async ({ page }) => {
    await loginMobile(page);
    
    // Ensure we're clocked in
    const clockInButton = page.getByRole('button', { name: /clock in/i });
    if (await clockInButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clockInButton.click();
      await page.waitForTimeout(3000);
    }
    
    // Now clock out
    const clockOutButton = page.getByRole('button', { name: /clock out/i });
    await expect(clockOutButton).toBeVisible({ timeout: 10000 });
    await clockOutButton.click();
    
    await page.waitForTimeout(3000);
    
    // Verify clocked out state
    await expect(page.getByRole('button', { name: /clock in/i })).toBeVisible({ timeout: 15000 });
  });

  test('should complete full shift cycle', async ({ page }) => {
    await loginMobile(page);
    
    // Start fresh - clock out if needed
    const clockOutBtn = page.getByRole('button', { name: /clock out/i });
    if (await clockOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clockOutBtn.click();
      await page.waitForTimeout(3000);
    }
    
    // Clock in
    await page.getByRole('button', { name: /clock in/i }).click();
    await page.waitForTimeout(3000);
    await expect(page.getByRole('button', { name: /clock out/i })).toBeVisible({ timeout: 15000 });
    
    // Clock out
    await page.getByRole('button', { name: /clock out/i }).click();
    await page.waitForTimeout(3000);
    await expect(page.getByRole('button', { name: /clock in/i })).toBeVisible({ timeout: 15000 });
  });

  test('should show shift in history after completion', async ({ page }) => {
    await loginMobile(page);
    
    // Navigate to history
    await page.getByRole('button', { name: /history/i }).click();
    await page.waitForTimeout(2000);
    
    // Should see Shift History heading
    await expect(page.getByText('Shift History')).toBeVisible({ timeout: 10000 });
    
    // Should see week ending section
    await expect(page.getByText(/Week Ending/i)).toBeVisible({ timeout: 5000 });
  });

});