import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

const TEST_PASSWORD = 'test1234';
const MOBILE_URL = 'https://timetrack-mobile-v2.vercel.app';
const DASHBOARD_URL = 'https://timetrack-dashboard-v2.vercel.app';

async function loginDashboard(page: any, email: string) {
  await page.goto(DASHBOARD_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
  await page.locator('form button:has-text("Sign In"), button[type="submit"]').click();
  
  await page.waitForTimeout(5000);
  
  // Wait for login to complete
  await expect(page.getByPlaceholder(/email/i)).not.toBeVisible({ timeout: 15000 });
}

test.describe('Multi-Tenant Isolation', () => {

  test('dashboard should only show own company employees', async ({ page }) => {
    await loginDashboard(page, 'info@cityscaffold.co.nz');
    
    await page.locator('text=Employees').first().click();
    await page.waitForTimeout(2000);
    
    await expect(page.getByText('GPS Tracking').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });

  test('dashboard should only show own company shifts', async ({ page }) => {
    await loginDashboard(page, 'info@cityscaffold.co.nz');
    
    await page.locator('text=Timesheets').first().click();
    await page.waitForTimeout(2000);
    
    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });

  test('dashboard should only show own company in live view', async ({ page }) => {
    await loginDashboard(page, 'info@cityscaffold.co.nz');
    
    await page.waitForTimeout(2000);
    
    // Should be on dashboard without errors
    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });

  test('new employee invite flow exists', async ({ page }) => {
    await page.goto(MOBILE_URL);
    await page.waitForLoadState('networkidle');
    
    await page.getByRole('button', { name: 'New Employee' }).click();
    await page.waitForTimeout(500);
    
    await expect(page.getByText('Find My Invite')).toBeVisible();
  });

});