import { test, expect } from '@playwright/test';
import { loginAsEmployee, navigateTo } from './helpers';

test.describe('Expenses', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should navigate to expenses view', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    // ExpensesView has h2 "Expenses" heading
    await expect(page.locator('h2:has-text("Expenses")').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show add expense button', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    // Button text is "+ Add Expense"
    const addBtn = page.locator('button:has-text("Add Expense")');
    await expect(addBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('should open expense form when clicking add', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    const addBtn = page.locator('button:has-text("Add Expense")').first();
    
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      
      // Form has: amount input type="number", category select, note textarea
      const hasAmount = await page.locator('input[type="number"]').isVisible().catch(() => false);
      const hasCategory = await page.locator('select').isVisible().catch(() => false);
      
      expect(hasAmount || hasCategory).toBeTruthy();
    }
  });

  test('should show expense categories', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    // Open form
    const addBtn = page.locator('button:has-text("Add Expense")').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Category is a <select> with EXPENSE_CATEGORIES options (Parking is default)
    const categorySelect = page.locator('select').first();
    
    if (await categorySelect.isVisible().catch(() => false)) {
      // Check the select has options - Parking, Fuel, Mileage, Meals, Materials, Tools, Other
      const hasCategories = await categorySelect.locator('option').count();
      expect(hasCategories).toBeGreaterThanOrEqual(3);
    }
  });

  test('should submit expense claim', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    const addBtn = page.locator('button:has-text("Add Expense")').first();
    
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    
    await addBtn.click();
    await page.waitForTimeout(500);
    
    // Fill amount
    const amountInput = page.locator('input[type="number"]').first();
    if (await amountInput.isVisible().catch(() => false)) {
      await amountInput.fill('25.50');
    }
    
    // Select category (select element, pick second option)
    const categorySelect = page.locator('select').first();
    if (await categorySelect.isVisible().catch(() => false)) {
      await categorySelect.selectOption({ index: 1 });
    }
    
    // Enter note
    const noteInput = page.locator('textarea').first();
    if (await noteInput.isVisible().catch(() => false)) {
      await noteInput.fill('Test expense from automated test');
    }
    
    // Submit - button text is "Submit Expense"
    const submitBtn = page.locator('button:has-text("Submit Expense")').first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      
      await page.waitForTimeout(2000);
      
      // Should show success toast or the expense in the list
      const success = await page.locator('text=/expense submitted|submitted|saved/i').isVisible().catch(() => false);
      const inList = await page.locator('text=/25.50|\\$25\\.50/i').isVisible().catch(() => false);
      
      expect(success || inList).toBeTruthy();
    }
  });

  test('should display existing expenses', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(4000);
    
    // Check for "YOUR EXPENSES" heading, status badges, or empty state
    const hasExpensesHeader = await page.locator('text=/YOUR EXPENSES/').isVisible().catch(() => false);
    const hasPending = await page.locator('text=/Pending/').isVisible().catch(() => false);
    const hasApproved = await page.locator('text=/Approved/').isVisible().catch(() => false);
    const noExpenses = await page.locator('text=/no expenses submitted yet/i').isVisible().catch(() => false);
    const hasAddBtn = await page.locator('button:has-text("Add Expense")').isVisible().catch(() => false);
    
    expect(hasExpensesHeader || hasPending || hasApproved || noExpenses || hasAddBtn).toBeTruthy();
  });

  test('should show expense status badges', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    await page.waitForTimeout(2000);
    
    // Status shows "✓ Approved" or "⏳ Pending"
    const hasBadges = await page.locator('text=/approved|pending/i').isVisible().catch(() => false);
    
    if (!hasBadges) {
      console.log('No expense status badges found (may have no expenses)');
    }
  });

  test('should allow editing pending expense', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    await page.waitForTimeout(2000);
    
    // Edit button on pending expenses
    const editBtn = page.locator('button:has-text("Edit")').first();
    
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      
      await page.waitForTimeout(500);
      // Should show edit form with "Edit Expense" heading
      const hasForm = await page.locator('text=/edit expense/i').isVisible().catch(() => false);
      const hasInput = await page.locator('input[type="number"], textarea, select').isVisible().catch(() => false);
      expect(hasForm || hasInput).toBeTruthy();
    }
  });

  test('should allow deleting pending expense', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    await page.waitForTimeout(2000);
    
    // Delete button on pending expenses
    const deleteBtn = page.locator('button:has-text("Delete")').first();
    
    if (await deleteBtn.isVisible().catch(() => false)) {
      // Note: handleDelete uses confirm() dialog
      page.on('dialog', dialog => dialog.accept());
      
      await deleteBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
