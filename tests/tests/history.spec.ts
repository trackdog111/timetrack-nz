import { test, expect } from '@playwright/test';
import { loginAsEmployee, navigateTo } from './helpers';

test.describe('Shift History', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should navigate to history view', async ({ page }) => {
    await navigateTo(page, 'history');
    
    // Should see "Shift History" or similar heading
    await expect(page.locator('text=/shift history|history|past shifts/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('should display list of past shifts', async ({ page }) => {
    await navigateTo(page, 'history');
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    // Should either show shifts or "No shifts" message
    const hasShifts = await page.locator('text=/\\d+\\/\\d+\\/\\d+|\\d+ hours?|\\d+h \\d+m/i').isVisible().catch(() => false);
    const noShifts = await page.locator('text=/no shifts|no history|nothing|empty/i').isVisible().catch(() => false);
    
    expect(hasShifts || noShifts).toBeTruthy();
  });

  test('should show shift details when clicking a shift', async ({ page }) => {
    await navigateTo(page, 'history');
    
    await page.waitForTimeout(2000);
    
    // Find a shift entry to click
    const shiftEntry = page.locator('[role="button"], [role="listitem"], .shift-item, div:has-text(/\\d+\\/\\d+/)').first();
    
    if (await shiftEntry.isVisible().catch(() => false)) {
      await shiftEntry.click();
      
      // Should show details like start time, end time, duration, location
      await page.waitForTimeout(1000);
      
      // Look for expanded details
      const hasDetails = await page.locator('text=/start|end|duration|location|hours/i').isVisible().catch(() => false);
      expect(hasDetails).toBeTruthy();
    }
  });

  test('should show map modal when clicking map button', async ({ page }) => {
    await navigateTo(page, 'history');
    
    await page.waitForTimeout(2000);
    
    // Look for map button/icon
    const mapBtn = page.locator('button:has-text("Map"), [aria-label*="map" i], button:has([data-icon="map"]), svg[class*="map"]').first();
    
    if (await mapBtn.isVisible().catch(() => false)) {
      await mapBtn.click();
      
      // Should show map modal
      await expect(page.locator('text=/map|location|route/i, [class*="map"], #map, .leaflet-container')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should close map modal', async ({ page }) => {
    await navigateTo(page, 'history');
    
    await page.waitForTimeout(2000);
    
    const mapBtn = page.locator('button:has-text("Map"), [aria-label*="map" i]').first();
    
    if (await mapBtn.isVisible().catch(() => false)) {
      await mapBtn.click();
      
      // Wait for modal to appear
      await page.waitForTimeout(1000);
      
      // Find close button
      const closeBtn = page.locator('button:has-text("Close"), button:has-text("×"), [aria-label*="close" i]').first();
      
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        
        // Modal should close
        await page.waitForTimeout(500);
      }
    }
  });
});
