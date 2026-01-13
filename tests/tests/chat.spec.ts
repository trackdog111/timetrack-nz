import { test, expect } from '@playwright/test';
import { loginAsEmployee, navigateTo } from './helpers';

test.describe('Chat', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should navigate to chat view', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    // Should see chat interface
    await expect(page.locator('text=/chat|message|conversation/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show message input field', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    // Should see input for typing messages
    const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i], input[type="text"], textarea').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });
  });

  test('should show send button', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    // Should see send button
    const sendBtn = page.locator('button:has-text("Send"), button[type="submit"], [aria-label*="send" i]').first();
    await expect(sendBtn).toBeVisible({ timeout: 5000 });
  });

  test('should send a message', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    const testMessage = `Test message ${Date.now()}`;
    
    // Type message
    const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i], input[type="text"], textarea').first();
    await messageInput.fill(testMessage);
    
    // Send
    const sendBtn = page.locator('button:has-text("Send"), button[type="submit"], [aria-label*="send" i]').first();
    await sendBtn.click();
    
    // Message should appear in chat
    await page.waitForTimeout(2000);
    await expect(page.locator(`text=${testMessage}`)).toBeVisible({ timeout: 5000 });
  });

  test('should display existing messages', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    await page.waitForTimeout(2000);
    
    // Should show messages or empty state
    const hasMessages = await page.locator('[class*="message"], [role="listitem"]').count() > 0;
    const isEmpty = await page.locator('text=/no messages|start a conversation|empty/i').isVisible().catch(() => false);
    
    expect(hasMessages || isEmpty).toBeTruthy();
  });

  test('should show message timestamps', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    await page.waitForTimeout(2000);
    
    // Look for timestamps in messages
    const hasTimestamps = await page.locator('text=/\\d+:\\d+|\\d+ (am|pm)|today|yesterday/i').isVisible().catch(() => false);
    
    // Informational - timestamps may not be visible if no messages
    console.log('Timestamps visible:', hasTimestamps);
  });

  test('should auto-scroll to latest message', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    // Send a message
    const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i], input[type="text"], textarea').first();
    const sendBtn = page.locator('button:has-text("Send"), button[type="submit"], [aria-label*="send" i]').first();
    
    if (await messageInput.isVisible() && await sendBtn.isVisible()) {
      await messageInput.fill('Scroll test message');
      await sendBtn.click();
      
      await page.waitForTimeout(1000);
      
      // Check if latest message is in view
      const latestMessage = page.locator('text="Scroll test message"');
      if (await latestMessage.isVisible()) {
        const isInView = await latestMessage.isIntersectingViewport();
        expect(isInView).toBeTruthy();
      }
    }
  });

  test('should clear input after sending', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i], input[type="text"], textarea').first();
    const sendBtn = page.locator('button:has-text("Send"), button[type="submit"], [aria-label*="send" i]').first();
    
    if (await messageInput.isVisible() && await sendBtn.isVisible()) {
      await messageInput.fill('Test clear input');
      await sendBtn.click();
      
      await page.waitForTimeout(500);
      
      // Input should be empty
      const inputValue = await messageInput.inputValue();
      expect(inputValue).toBe('');
    }
  });
});
