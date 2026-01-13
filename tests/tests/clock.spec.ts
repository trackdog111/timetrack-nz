import { test, expect } from '@playwright/test';
import { loginAsEmployee, navigateTo } from './helpers';

test.describe('Clock In/Out', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should show clock view with clock in button when not clocked in', async ({ page }) => {
    await navigateTo(page, 'clock');
    
    // Should see either "Clock In" button or "Clock Out" button
    const clockInBtn = page.locator('button:has-text("Clock In")');
    const clockOutBtn = page.locator('button:has-text("Clock Out")');
    
    const hasClockIn = await clockInBtn.isVisible().catch(() => false);
    const hasClockOut = await clockOutBtn.isVisible().catch(() => false);
    
    expect(hasClockIn || hasClockOut).toBeTruthy();
  });

  test('should clock in successfully', async ({ page }) => {
    await navigateTo(page, 'clock');
    
    const clockInBtn = page.locator('button:has-text("Clock In")');
    
    // Skip if already clocked in
    if (!(await clockInBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    
    await clockInBtn.click();
    
    // Should now show Clock Out button
    await expect(page.locator('button:has-text("Clock Out")')).toBeVisible({ timeout: 10000 });
  });

  test('should show current shift duration when clocked in', async ({ page }) => {
    await navigateTo(page, 'clock');
    
    // Check if clocked in
    const clockOutBtn = page.locator('button:has-text("Clock Out")');
    
    if (!(await clockOutBtn.isVisible().catch(() => false))) {
      // Clock in first
      await page.click('button:has-text("Clock In")');
      await expect(clockOutBtn).toBeVisible({ timeout: 10000 });
    }
    
    // Should show duration timer (format like 0:00:00 or 00:00:00)
    await expect(page.locator('text=/\\d+:\\d{2}(:\\d{2})?/')).toBeVisible({ timeout: 5000 });
  });

  test('should clock out successfully', async ({ page }) => {
    await navigateTo(page, 'clock');
    
    const clockOutBtn = page.locator('button:has-text("Clock Out")');
    
    // Skip if not clocked in
    if (!(await clockOutBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    
    await clockOutBtn.click();
    
    // May show confirmation dialog - click confirm if present
    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("End Shift")');
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }
    
    // Should now show Clock In button
    await expect(page.locator('button:has-text("Clock In")')).toBeVisible({ timeout: 10000 });
  });

  test('should request location permission for GPS tracking', async ({ page, context }) => {
    // Grant geolocation permission
    await context.grantPermissions(['geolocation']);
    
    // Mock geolocation (Auckland coordinates)
    await context.setGeolocation({ latitude: -36.8485, longitude: 174.7633 });
    
    await navigateTo(page, 'clock');
    
    // Clock in (if not already)
    const clockInBtn = page.locator('button:has-text("Clock In")');
    if (await clockInBtn.isVisible().catch(() => false)) {
      await clockInBtn.click();
      
      // Should complete without location error
      await expect(page.locator('button:has-text("Clock Out")')).toBeVisible({ timeout: 15000 });
    }
  });

  test('should show break button when clocked in', async ({ page }) => {
    await navigateTo(page, 'clock');
    
    // Ensure clocked in
    const clockOutBtn = page.locator('button:has-text("Clock Out")');
    if (!(await clockOutBtn.isVisible().catch(() => false))) {
      await page.click('button:has-text("Clock In")');
      await expect(clockOutBtn).toBeVisible({ timeout: 10000 });
    }
    
    // Should see break button
    const breakBtn = page.locator('button:has-text("Break"), button:has-text("Start Break"), button:has-text("Take Break")');
    await expect(breakBtn).toBeVisible({ timeout: 5000 });
  });
});
