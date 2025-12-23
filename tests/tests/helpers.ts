import { Page, expect } from '@playwright/test';

export function generateTestEmail(): string {
  const timestamp = Date.now();
  return `test-${timestamp}@example.com`;
}

export const TEST_PASSWORD = 'test1234';
export const TEST_COMPANY = 'Test Company';

export const MOBILE_URL = 'https://timetrack-mobile-v2.vercel.app';
export const DASHBOARD_URL = 'https://timetrack-dashboard-v2.vercel.app';

export async function waitForAuth(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

export async function loginMobile(page: Page, email: string, password: string): Promise<void> {
  await page.goto(MOBILE_URL);
  await waitForAuth(page);
  
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.locator('form button:has-text("Sign In"), button[type="submit"]').click();
  
  await waitForAuth(page);
  await page.waitForTimeout(2000);
}

export async function loginDashboard(page: Page, email: string, password: string): Promise<void> {
  await page.goto(DASHBOARD_URL);
  await waitForAuth(page);
  
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.locator('form button:has-text("Sign In"), button[type="submit"]').click();
  
  await waitForAuth(page);
  await page.waitForTimeout(2000);
}

export async function clockIn(page: Page): Promise<void> {
  const clockInButton = page.getByRole('button', { name: /clock in/i });
  await expect(clockInButton).toBeVisible({ timeout: 10000 });
  await clockInButton.click();
  await page.waitForTimeout(3000);
  await expect(page.getByRole('button', { name: /clock out/i })).toBeVisible({ timeout: 15000 });
}

export async function clockOut(page: Page): Promise<void> {
  const clockOutButton = page.getByRole('button', { name: /clock out/i });
  await expect(clockOutButton).toBeVisible();
  await clockOutButton.click();
  await page.waitForTimeout(3000);
  await expect(page.getByRole('button', { name: /clock in/i })).toBeVisible({ timeout: 15000 });
}

export async function grantGeolocation(page: Page): Promise<void> {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -36.8509, longitude: 174.7645 });
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  const clockButton = page.getByRole('button', { name: /clock in|clock out/i });
  return await clockButton.isVisible({ timeout: 5000 }).catch(() => false);
}