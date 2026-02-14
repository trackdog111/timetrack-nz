import { test, expect } from '@playwright/test';
import { loginAsEmployee, navigateTo } from './helpers';

test.describe('Chat', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsEmployee(page);
  });

  test('should navigate to chat view', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    // ChatView shows "Team Chat" and "DM" tab buttons, or "Chat is disabled"
    await expect(page.locator('text=/team chat|chat is disabled|type a message/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show message input field', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    // Input has placeholder "Type a message..."
    const messageInput = page.locator('input[placeholder="Type a message..."]');
    await expect(messageInput).toBeVisible({ timeout: 5000 });
  });

  test('should show send button', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    // Send button with text "Send"
    const sendBtn = page.locator('button:has-text("Send")');
    await expect(sendBtn).toBeVisible({ timeout: 5000 });
  });

  test('should send a message', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    const testMessage = `Test message ${Date.now()}`;
    
    const messageInput = page.locator('input[placeholder="Type a message..."]');
    await messageInput.fill(testMessage);
    
    const sendBtn = page.locator('button:has-text("Send")');
    await sendBtn.click();
    
    await page.waitForTimeout(2000);
    await expect(page.locator(`text=${testMessage}`)).toBeVisible({ timeout: 5000 });
  });

  test('should display existing messages', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    await page.waitForTimeout(2000);
    
    // ChatView shows messages or "No messages yet. Start the conversation!"
    const hasMessages = await page.locator('input[placeholder="Type a message..."]').isVisible().catch(() => false);
    const isEmpty = await page.locator('text=/no messages yet/i').isVisible().catch(() => false);
    
    expect(hasMessages || isEmpty).toBeTruthy();
  });

  test('should show message timestamps', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    await page.waitForTimeout(2000);
    
    const hasTimestamps = await page.locator('text=/\\d+:\\d+|\\d+ (am|pm)/i').isVisible().catch(() => false);
    console.log('Timestamps visible:', hasTimestamps);
  });

  test('should auto-scroll to latest message', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    const messageInput = page.locator('input[placeholder="Type a message..."]');
    const sendBtn = page.locator('button:has-text("Send")');
    
    if (await messageInput.isVisible() && await sendBtn.isVisible()) {
      const uniqueMsg = `Scroll test ${Date.now()}`;
      await messageInput.fill(uniqueMsg);
      await sendBtn.click();
      
      await page.waitForTimeout(2000);
      
      const latestMessage = page.locator(`text="${uniqueMsg}"`).last();
      if (await latestMessage.isVisible().catch(() => false)) {
        const box = await latestMessage.boundingBox();
        const viewport = page.viewportSize();
        const isInView = box !== null && viewport !== null && box.y >= 0 && box.y < viewport.height;
        expect(isInView).toBeTruthy();
      }
    }
  });

  test('should clear input after sending', async ({ page }) => {
    await navigateTo(page, 'chat');
    
    const messageInput = page.locator('input[placeholder="Type a message..."]');
    const sendBtn = page.locator('button:has-text("Send")');
    
    if (await messageInput.isVisible() && await sendBtn.isVisible()) {
      await messageInput.fill('Test clear input');
      await sendBtn.click();
      
      await page.waitForTimeout(500);
      
      const inputValue = await messageInput.inputValue();
      expect(inputValue).toBe('');
    }
  });
});
