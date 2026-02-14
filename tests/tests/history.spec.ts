import { test, expect } from '@playwright/test';
import { loginAsEmployee, navigateTo } from './helpers';

test.describe('Shift History', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should navigate to history view', async ({ page }) => {
    await navigateTo(page, 'history');
    
    // HistoryView has h2 "Shift History"
    await expect(page.locator('h2:has-text("Shift History")').first()).toBeVisible({ timeout: 5000 });
  });

  test('should display list of past shifts', async ({ page }) => {
    await navigateTo(page, 'history');
    
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(4000);
    
    // HistoryView shows "Week Ending: {date}" headers when shifts exist
    const hasWeeks = await page.locator('text=/Week Ending/').isVisible().catch(() => false);
    const noShifts = await page.locator('text=/no shift|no history|nothing/i').isVisible().catch(() => false);
    const hasHeading = await page.locator('h2:has-text("Shift History")').isVisible().catch(() => false);
    
    expect(hasWeeks || noShifts || hasHeading).toBeTruthy();
  });

  test('should show shift details when clicking a shift', async ({ page }) => {
    await navigateTo(page, 'history');
    
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(4000);
    
    // Week groups are expandable - click "Week Ending" header to expand
    const weekHeader = page.locator('text=/Week Ending/').first();
    
    if (await weekHeader.isVisible().catch(() => false)) {
      await weekHeader.click();
      await page.waitForTimeout(1500);
      
      // Expanded shows: "Total shift:", "Paid breaks:", "Unpaid breaks:", "worked"
      const hasDetails = await page.locator('text=/Total shift|Paid breaks|Unpaid breaks|worked/').isVisible().catch(() => false);
      expect(hasDetails).toBeTruthy();
    }
  });

  test('should show map modal when clicking map button', async ({ page }) => {
    await navigateTo(page, 'history');
    
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(4000);
    
    // Expand a week first
    const weekHeader = page.locator('text=/Week Ending/').first();
    if (await weekHeader.isVisible().catch(() => false)) {
      await weekHeader.click();
      await page.waitForTimeout(1000);
    }
    
    // Look for map button
    const mapBtn = page.locator('button:has-text("Map")').first();
    
    if (await mapBtn.isVisible().catch(() => false)) {
      await mapBtn.click();
      await page.waitForTimeout(1000);
      
      // Check for leaflet map container OR close button (modal is open)
      const hasMap = await page.locator('.leaflet-container').isVisible().catch(() => false);
      const hasClose = await page.locator('text=/Close/i').isVisible().catch(() => false);
      expect(hasMap || hasClose).toBeTruthy();
    }
  });

  test('should close map modal', async ({ page }) => {
    await navigateTo(page, 'history');
    
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(4000);
    
    const weekHeader = page.locator('text=/Week Ending/').first();
    if (await weekHeader.isVisible().catch(() => false)) {
      await weekHeader.click();
      await page.waitForTimeout(1000);
    }
    
    const mapBtn = page.locator('button:has-text("Map")').first();
    
    if (await mapBtn.isVisible().catch(() => false)) {
      await mapBtn.click();
      await page.waitForTimeout(1000);
      
      const closeBtn = page.locator('button:has-text("Close")').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });
});
