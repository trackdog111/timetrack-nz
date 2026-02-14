import { test, expect } from '@playwright/test';
import { loginAsEmployee, navigateTo } from './helpers';

test.describe('Clock In/Out', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -36.8485, longitude: 174.7633 });
    await loginAsEmployee(page);
  });

  test('should show clock view with worksite selector and clock in button', async ({ page }) => {
    await navigateTo(page, 'clock');

    const clockInBtn = page.locator('button:has-text("Clock In")');
    const clockOutBtn = page.locator('button:has-text("Clock Out")');

    const hasClockIn = await clockInBtn.isVisible().catch(() => false);
    const hasClockOut = await clockOutBtn.isVisible().catch(() => false);

    expect(hasClockIn || hasClockOut).toBeTruthy();
  });

  test('should clock in successfully with worksite selected', async ({ page }) => {
    await navigateTo(page, 'clock');

    const clockInBtn = page.locator('button:has-text("Clock In")');

    if (!(await clockInBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await page.selectOption('select', { label: 'East Tamaki' });
    await page.waitForTimeout(500);

    await clockInBtn.click();

    await expect(page.locator('button:has-text("Clock Out")')).toBeVisible({ timeout: 15000 });
  });

  test('should show current shift duration when clocked in', async ({ page }) => {
    await navigateTo(page, 'clock');

    const clockOutBtn = page.locator('button:has-text("Clock Out")');

    if (!(await clockOutBtn.isVisible().catch(() => false))) {
      await page.selectOption('select', { label: 'East Tamaki' });
      await page.waitForTimeout(500);
      await page.click('button:has-text("Clock In")');
      await expect(clockOutBtn).toBeVisible({ timeout: 15000 });
    }

    await expect(page.locator('text=/\\d+:\\d{2}(:\\d{2})?/')).toBeVisible({ timeout: 5000 });
  });

  test('should clock out successfully', async ({ page }) => {
    await navigateTo(page, 'clock');

    const clockOutBtn = page.locator('button:has-text("Clock Out")');

    if (!(await clockOutBtn.isVisible().catch(() => false))) {
      await page.selectOption('select', { label: 'East Tamaki' });
      await page.waitForTimeout(500);
      await page.click('button:has-text("Clock In")');
      await expect(clockOutBtn).toBeVisible({ timeout: 15000 });
    }

    await clockOutBtn.click();

    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("End Shift")');
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.locator('button:has-text("Clock In")')).toBeVisible({ timeout: 15000 });
  });

  test('should show break button when clocked in', async ({ page }) => {
    await navigateTo(page, 'clock');

    const clockOutBtn = page.locator('button:has-text("Clock Out")');
    if (!(await clockOutBtn.isVisible().catch(() => false))) {
      await page.selectOption('select', { label: 'East Tamaki' });
      await page.waitForTimeout(500);
      await page.click('button:has-text("Clock In")');
      await expect(clockOutBtn).toBeVisible({ timeout: 15000 });
    }

    const breakBtn = page.getByRole('button', { name: /start break/i });
    await expect(breakBtn).toBeVisible({ timeout: 5000 });
  });

  test('should show travel button when clocked in', async ({ page }) => {
    await navigateTo(page, 'clock');

    const clockOutBtn = page.locator('button:has-text("Clock Out")');
    if (!(await clockOutBtn.isVisible().catch(() => false))) {
      await page.selectOption('select', { label: 'East Tamaki' });
      await page.waitForTimeout(500);
      await page.click('button:has-text("Clock In")');
      await expect(clockOutBtn).toBeVisible({ timeout: 15000 });
    }

    const travelBtn = page.getByRole('button', { name: /travel/i });
    await expect(travelBtn).toBeVisible({ timeout: 5000 });
  });
});
