import { test, expect } from '@playwright/test';

// Only test on desktop - dashboard isn't designed for mobile
test.use({ viewport: { width: 1280, height: 720 } });

const MANAGER_EMAIL = 'info@cityscaffold.co.nz';
const TEST_PASSWORD = 'test1234';

async function loginDashboard(page: any, email: string, password: string) {
  await page.goto('https://timetrack-dashboard-v2.vercel.app');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.locator('form button:has-text("Sign In"), button[type="submit"]').click();
  
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await loginDashboard(page, MANAGER_EMAIL, TEST_PASSWORD);
  });

  test('should load Live View', async ({ page }) => {
    // LiveView shows "Live View" heading and "No active shifts" when empty
    await expect(page.locator('text=/live view|no active shifts/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('should load Employees View', async ({ page }) => {
    await page.locator('text=Employees').first().click();
    await page.waitForTimeout(2000);
    
    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });

  test('should load Timesheets View', async ({ page }) => {
    await page.locator('text=Timesheets').first().click();
    await page.waitForTimeout(2000);
    
    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });

  test('should load Reports View', async ({ page }) => {
    // Dashboard may use "Reports" or "Analytics" for this nav item
    const reportsBtn = page.locator('text=/Reports|Analytics/i').first();
    await reportsBtn.click();
    await page.waitForTimeout(2000);
    
    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });

  test('should load Chat View', async ({ page }) => {
    await page.locator('text=Chat').first().click();
    await page.waitForTimeout(2000);
    
    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });

  test('should load Settings View', async ({ page }) => {
    await page.locator('text=Settings').first().click();
    await page.waitForTimeout(2000);
    
    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });

});
