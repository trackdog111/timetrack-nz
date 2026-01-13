import { test as base, expect, Page } from '@playwright/test';

// Test user credentials - UPDATE THESE with real test account
export const TEST_EMPLOYEE = {
  email: 'info@cityscaffold.co.nz',
  password: 'test1234',
};

export const TEST_OWNER = {
  email: 'test.owner@example.com', 
  password: 'test1234',
};

// Helper to login as employee
export async function loginAsEmployee(page: Page) {
  await page.goto('/');
  
  // Wait for login form
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 10000 });
  
  // Fill credentials
  await page.fill('input[type="email"], input[placeholder*="email" i]', TEST_EMPLOYEE.email);
  await page.fill('input[type="password"], input[placeholder*="password" i]', TEST_EMPLOYEE.password);
  
  // Click login button
  await page.click('button[type="submit"]');
  
  // Wait for navigation to main app
  await page.waitForSelector('text=/trackable/i', { timeout: 30000 });
}

// Helper to login as business owner
export async function loginAsOwner(page: Page) {
  await page.goto('/');
  
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 10000 });
  
  await page.fill('input[type="email"], input[placeholder*="email" i]', TEST_OWNER.email);
  await page.fill('input[type="password"], input[placeholder*="password" i]', TEST_OWNER.password);
  
  await page.click('button[type="submit"]');
  
  await page.waitForSelector('text=/trackable/i', { timeout: 30000 });
}

// Helper to logout
export async function logout(page: Page) {
  const signOutBtn = page.locator('text=/sign out/i');
  
  if (await signOutBtn.count() > 0) {
    await signOutBtn.first().click();
  }
  
  // Wait for login screen
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 10000 });
}

// Helper to navigate to a specific tab/view
export async function navigateTo(page: Page, tabName: 'clock' | 'history' | 'expenses' | 'chat') {
  const tabSelectors: Record<string, string> = {
    clock: 'text=/clock/i',
    history: 'text=/history/i',
    expenses: 'text=/expense/i',
    chat: 'text=/chat/i',
  };
  
  await page.click(tabSelectors[tabName]);
  await page.waitForTimeout(500);
}

// Extended test with login helper
export const test = base.extend<{ loginPage: Page }>({
  loginPage: async ({ page }, use) => {
    await loginAsEmployee(page);
    await use(page);
  },
});

export { expect };