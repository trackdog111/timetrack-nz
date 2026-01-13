import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests sequentially for predictable state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  
  use: {
    // Base URL - change to your local dev server or deployed app
    baseURL: process.env.TEST_URL || 'http://localhost:5173',
    
    // Collect trace on failure for debugging
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    
    // Timeout for actions
    actionTimeout: 10000,
  },

  // Test timeout
  timeout: 60000,

  projects: [
    // Mobile viewport (primary - matches your app)
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
      },
    },
    
    // iPhone viewport
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 13'],
      },
    },
    
    // Desktop (for dashboard testing later)
    {
      name: 'desktop-chrome',
      use: { 
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // Run local dev server before tests (optional)
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  // },
});
