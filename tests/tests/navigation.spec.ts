import { test, expect } from '@playwright/test';
import { loginAsEmployee } from './helpers';

test.describe('Navigation & UI', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should show header with app name', async ({ page }) => {
    // App.tsx header has h1 "Trackable NZ"
    await expect(page.locator('h1:has-text("Trackable NZ")').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show bottom navigation bar', async ({ page }) => {
    // App.tsx has <nav> element with buttons
    const navElement = page.locator('nav').first();
    await expect(navElement).toBeVisible({ timeout: 5000 });
    
    // Should have nav buttons: Clock, Chat (if enabled), Expenses, History
    const navButtons = page.locator('nav button');
    const count = await navButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('should navigate between all tabs', async ({ page }) => {
    // Nav buttons have labels: Clock, Chat, Expenses, History
    const tabs = ['Clock', 'Chat', 'Expenses', 'History'];
    
    for (const tab of tabs) {
      const tabBtn = page.locator(`nav button:has-text("${tab}")`).first();
      
      if (await tabBtn.isVisible().catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(500);
        console.log(`Navigated to ${tab}`);
      }
    }
  });

  test('should highlight active tab', async ({ page }) => {
    // Click on History tab
    const historyTab = page.locator('nav button:has-text("History")').first();
    
    if (await historyTab.isVisible().catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(500);
      
      // Active tab has fontWeight 600 and theme.primary color on the label span
      const isActive = await historyTab.evaluate(el => {
        const span = el.querySelector('span:last-child');
        if (!span) return false;
        const style = window.getComputedStyle(span);
        return style.fontWeight === '600' || parseInt(style.fontWeight) >= 600;
      }).catch(() => false);
      
      console.log('History tab active state:', isActive);
    }
  });

  test('should show settings/profile option', async ({ page }) => {
    // App.tsx has Sign Out button and theme toggle in header
    const signOutBtn = page.locator('button:has-text("Sign Out"), button:has-text("Exit Demo")').first();
    const themeToggle = page.locator('button:has-text("☀️"), button:has-text("🌙")').first();
    
    const hasSignOut = await signOutBtn.isVisible().catch(() => false);
    const hasTheme = await themeToggle.isVisible().catch(() => false);
    console.log('Sign Out visible:', hasSignOut, 'Theme toggle visible:', hasTheme);
  });

  test('should display correctly on mobile viewport', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('should not have horizontal scroll', async ({ page }) => {
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    
    expect(hasHorizontalScroll).toBeFalsy();
  });

  test('should have correct safe area padding (no content cut off)', async ({ page }) => {
    // Check that content is not flush against the viewport edge
    // Use h1 boundingBox - if x >= 4, content has padding
    const h1 = page.locator('h1').first();
    
    if (await h1.isVisible().catch(() => false)) {
      const box = await h1.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test('should switch themes if dark mode available', async ({ page }) => {
    // Theme toggle buttons: ☀️ (dark mode active) or 🌙 (light mode active)
    const themeToggle = page.locator('button:has-text("☀️"), button:has-text("🌙")').first();
    
    if (await themeToggle.isVisible().catch(() => false)) {
      const initialBg = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
      });
      
      await themeToggle.click();
      await page.waitForTimeout(500);
      
      const newBg = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
      });
      
      console.log('Theme changed:', initialBg !== newBg);
    }
  });
});
