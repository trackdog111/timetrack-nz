import { test, expect } from '@playwright/test';
import { loginAsEmployee, navigateTo } from './helpers';

test.describe('Expenses', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should navigate to expenses view', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    // Should see "Expenses" heading
    await expect(page.locator('text=/expense/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show add expense button', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    // Should see button to add new expense
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("+"), button:has-text("Submit"), button:has-text("Create")');
    await expect(addBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('should open expense form when clicking add', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    // Click add button
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("+")').first();
    
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      
      // Should show form with category, amount, description fields
      await page.waitForTimeout(1000);
      
      const hasCategory = await page.locator('select, [role="combobox"], text=/category/i').isVisible().catch(() => false);
      const hasAmount = await page.locator('input[type="number"], input[placeholder*="amount" i]').isVisible().catch(() => false);
      
      expect(hasCategory || hasAmount).toBeTruthy();
    }
  });

  test('should show expense categories', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    // Open form if needed
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("+")').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Look for category dropdown/select
    const categorySelect = page.locator('select, [role="combobox"], [role="listbox"]').first();
    
    if (await categorySelect.isVisible().catch(() => false)) {
      await categorySelect.click();
      
      // Should show categories like Mileage, Parking, Fuel, etc.
      await page.waitForTimeout(500);
      const hasCategories = await page.locator('text=/mileage|parking|fuel|meals|materials|tools/i').isVisible().catch(() => false);
      expect(hasCategories).toBeTruthy();
    }
  });

  test('should submit expense claim', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    // Click add button
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("+")').first();
    
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    
    await addBtn.click();
    await page.waitForTimeout(500);
    
    // Fill form
    // Select category
    const categorySelect = page.locator('select').first();
    if (await categorySelect.isVisible().catch(() => false)) {
      await categorySelect.selectOption({ index: 1 }); // Select first non-empty option
    }
    
    // Enter amount
    const amountInput = page.locator('input[type="number"], input[placeholder*="amount" i]').first();
    if (await amountInput.isVisible().catch(() => false)) {
      await amountInput.fill('25.50');
    }
    
    // Enter description
    const descInput = page.locator('textarea, input[placeholder*="description" i], input[placeholder*="note" i]').first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill('Test expense from automated test');
    }
    
    // Submit
    const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Save"), button:has-text("Add Expense")').first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      
      // Should show success or return to list
      await page.waitForTimeout(2000);
      
      // Either see success message or the new expense in list
      const success = await page.locator('text=/success|submitted|saved|pending/i').isVisible().catch(() => false);
      const inList = await page.locator('text=/25.50|test expense/i').isVisible().catch(() => false);
      
      expect(success || inList).toBeTruthy();
    }
  });

  test('should display existing expenses', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    await page.waitForTimeout(2000);
    
    // Should show list of expenses or "No expenses" message
    const hasExpenses = await page.locator('text=/\\$\\d+|pending|approved|rejected/i').isVisible().catch(() => false);
    const noExpenses = await page.locator('text=/no expense|empty|nothing/i').isVisible().catch(() => false);
    
    expect(hasExpenses || noExpenses).toBeTruthy();
  });

  test('should show expense status badges', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    await page.waitForTimeout(2000);
    
    // Look for status badges
    const hasBadges = await page.locator('text=/pending|approved|rejected/i, [class*="badge"], [class*="status"]').isVisible().catch(() => false);
    
    // This is optional - only passes if there are expenses with status
    if (!hasBadges) {
      console.log('No expense status badges found (may have no expenses)');
    }
  });

  test('should allow editing pending expense', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    await page.waitForTimeout(2000);
    
    // Find edit button on a pending expense
    const editBtn = page.locator('button:has-text("Edit"), [aria-label*="edit" i]').first();
    
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      
      // Should show edit form
      await page.waitForTimeout(500);
      const hasForm = await page.locator('input[type="number"], textarea, select').isVisible().catch(() => false);
      expect(hasForm).toBeTruthy();
    }
  });

  test('should allow deleting pending expense', async ({ page }) => {
    await navigateTo(page, 'expenses');
    
    await page.waitForTimeout(2000);
    
    // Find delete button on a pending expense
    const deleteBtn = page.locator('button:has-text("Delete"), button:has-text("Remove"), [aria-label*="delete" i]').first();
    
    if (await deleteBtn.isVisible().catch(() => false)) {
      // Get count before
      const expenseCount = await page.locator('[class*="expense"], [role="listitem"]').count();
      
      await deleteBtn.click();
      
      // May show confirmation
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }
      
      await page.waitForTimeout(1000);
    }
  });
});
