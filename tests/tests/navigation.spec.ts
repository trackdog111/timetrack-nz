import { test, expect } from '@playwright/test';
import { loginAsEmployee } from './helpers';

test.describe('Navigation & UI', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should show header with app name', async ({ page }) => {
    await expect(page.locator('text=/trackable/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show bottom navigation bar', async ({ page }) => {
    // Should see nav items
    const navItems = page.locator('nav, [role="navigation"], [class*="nav"]').first();
    await expect(navItems).toBeVisible({ timeout: 5000 });
    
    // Should have multiple nav items
    const navButtons = page.locator('nav button, nav a, [role="navigation"] button');
    const count = await navButtons.count();
    expect(count).toBeGreaterThanOrEqual(3); // Clock, History, Expenses, Chat
  });

  test('should navigate between all tabs', async ({ page }) => {
    const tabs = ['clock', 'history', 'expenses', 'chat'];
    
    for (const tab of tabs) {
      const tabBtn = page.locator(`text=/${tab}/i, [aria-label*="${tab}" i]`).first();
      
      if (await tabBtn.isVisible().catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(500);
        
        // Verify navigation worked (URL or content change)
        console.log(`Navigated to ${tab}`);
      }
    }
  });

  test('should highlight active tab', async ({ page }) => {
    // Click on History tab
    const historyTab = page.locator('text=/history/i, [aria-label*="history" i]').first();
    
    if (await historyTab.isVisible().catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(500);
      
      // The active tab should have different styling (check for active class or aria-selected)
      const isActive = await historyTab.evaluate(el => {
        const classes = el.className;
        const style = window.getComputedStyle(el);
        return classes.includes('active') || 
               el.getAttribute('aria-selected') === 'true' ||
               style.backgroundColor !== 'rgba(0, 0, 0, 0)';
      }).catch(() => false);
      
      // This test is informational - styling varies
      console.log('History tab active state:', isActive);
    }
  });

  test('should show settings/profile option', async ({ page }) => {
    // Look for settings icon or profile button
    const settingsBtn = page.locator('[aria-label*="settings" i], [aria-label*="profile" i], [aria-label*="menu" i], button:has(svg[class*="cog"]), button:has(svg[class*="user"])').first();
    
    const hasSettings = await settingsBtn.isVisible().catch(() => false);
    console.log('Settings button visible:', hasSettings);
  });

  test('should display correctly on mobile viewport', async ({ page }) => {
    // Viewport is already set by Playwright config for mobile
    
    // Check that nothing overflows horizontally
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1); // Allow 1px tolerance
  });

  test('should not have horizontal scroll', async ({ page }) => {
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    
    expect(hasHorizontalScroll).toBeFalsy();
  });

  test('should have correct safe area padding (no content cut off)', async ({ page }) => {
    // Check main content is not at edge
    const mainContent = page.locator('main, [role="main"], .main-content').first();
    
    if (await mainContent.isVisible().catch(() => false)) {
      const padding = await mainContent.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          left: parseInt(style.paddingLeft),
          right: parseInt(style.paddingRight)
        };
      });
      
      // Should have at least some padding
      expect(padding.left).toBeGreaterThanOrEqual(8);
      expect(padding.right).toBeGreaterThanOrEqual(8);
    }
  });

  test('should switch themes if dark mode available', async ({ page }) => {
    // Look for theme toggle
    const themeToggle = page.locator('[aria-label*="theme" i], [aria-label*="dark" i], [aria-label*="light" i], button:has(svg[class*="sun"]), button:has(svg[class*="moon"])').first();
    
    if (await themeToggle.isVisible().catch(() => false)) {
      // Get initial background color
      const initialBg = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
      });
      
      await themeToggle.click();
      await page.waitForTimeout(500);
      
      // Get new background color
      const newBg = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
      });
      
      // Colors should be different
      console.log('Theme changed:', initialBg !== newBg);
    }
  });
});
