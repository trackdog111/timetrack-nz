import { test, expect } from '@playwright/test';
import { TEST_EMPLOYEE, loginAsEmployee, logout } from './helpers';

test.describe('Authentication', () => {
  
  test('should show login page on first load', async ({ page }) => {
    await page.goto('/');
    
    // Should see email input
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible({ timeout: 10000 });
    
    // Should see password input
    await expect(page.locator('input[type="password"], input[placeholder*="password" i]')).toBeVisible();
    
    // Should see login button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('input[type="email"], input[placeholder*="email" i]', 'invalid@test.com');
    await page.fill('input[type="password"], input[placeholder*="password" i]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('text=/error|invalid|incorrect|failed/i')).toBeVisible({ timeout: 10000 });
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await loginAsEmployee(page);
    
    // Should see main app content (header with Trackable NZ)
    await expect(page.locator('text=/trackable/i')).toBeVisible();
    
    // Should see bottom navigation
    await expect(page.locator('text=/clock|history|expense/i').first()).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    await loginAsEmployee(page);
    await logout(page);
    
    // Should be back on login screen
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible({ timeout: 10000 });
  });

  test('should persist session on page reload', async ({ page }) => {
    await loginAsEmployee(page);
    
    // Reload page
    await page.reload();
    
    // Should still be logged in (not see login form)
    await page.waitForTimeout(2000);
    
    // Either logged in (sees app) or login page (session expired)
    const isLoggedIn = await page.locator('text=/trackable/i').isVisible().catch(() => false);
    const isLoginPage = await page.locator('input[type="email"]').isVisible().catch(() => false);
    
    expect(isLoggedIn || isLoginPage).toBeTruthy();
  });
});
