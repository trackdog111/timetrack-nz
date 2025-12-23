import { test, expect } from '@playwright/test';

const TEST_PASSWORD = 'test1234';
const MOBILE_URL = 'https://timetrack-mobile-v2.vercel.app';
const DASHBOARD_URL = 'https://timetrack-dashboard-v2.vercel.app';

test.describe('Authentication', () => {
  
  test.describe('Mobile App', () => {
    
    test('should show login screen when not authenticated', async ({ page }) => {
      await page.goto(MOBILE_URL);
      await page.waitForLoadState('networkidle');
      
      await expect(page.getByPlaceholder(/email/i)).toBeVisible();
      await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto(MOBILE_URL);
      await page.waitForLoadState('networkidle');
      
      await page.getByPlaceholder(/email/i).fill('invalid@example.com');
      await page.getByPlaceholder(/password/i).fill('wrongpassword');
      await page.locator('form button:has-text("Sign In"), button[type="submit"]').click();
      
      await expect(page.getByText(/Firebase|Error|invalid/i)).toBeVisible({ timeout: 10000 });
    });

    test('should show New Employee invite flow', async ({ page }) => {
      await page.goto(MOBILE_URL);
      await page.waitForLoadState('networkidle');
      
      await page.getByRole('button', { name: 'New Employee' }).click();
      await page.waitForTimeout(500);
      
      await expect(page.getByText('Find My Invite')).toBeVisible();
    });

    test('should login existing user', async ({ page }) => {
      await page.goto(MOBILE_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      await page.getByPlaceholder(/email/i).fill('trackdog111@hotmail.com');
      await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
      await page.locator('form button:has-text("Sign In"), button[type="submit"]').click();
      
      await page.waitForTimeout(5000);
      
      // After login, should NOT see login form anymore
      await expect(page.getByPlaceholder(/email/i)).not.toBeVisible({ timeout: 15000 });
    });

  });

  test.describe('Dashboard', () => {
    
    test('should show login screen when not authenticated', async ({ page }) => {
      await page.goto(DASHBOARD_URL);
      await page.waitForLoadState('networkidle');
      
      await expect(page.getByPlaceholder(/email/i)).toBeVisible();
      await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    });

    test('should login manager to dashboard', async ({ page }) => {
      await page.goto(DASHBOARD_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      await page.getByPlaceholder(/email/i).fill('info@cityscaffold.co.nz');
      await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
      await page.locator('form button:has-text("Sign In"), button[type="submit"]').click();
      
      await page.waitForTimeout(5000);
      
      // After login, should NOT see login form anymore
      await expect(page.getByPlaceholder(/email/i)).not.toBeVisible({ timeout: 15000 });
    });

  });

});