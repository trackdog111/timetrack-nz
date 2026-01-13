# Trackable NZ - Automated Tests

Playwright end-to-end tests for Trackable NZ mobile app.

## Quick Start

### 1. Extract and Install

```powershell
Expand-Archive -Path "trackable-tests.zip" -DestinationPath "D:\Projects\timetrack-nz\tests" -Force
```

```powershell
cd D:\Projects\timetrack-nz\tests
```

```powershell
npm install
```

```powershell
npx playwright install
```

### 2. Configure Test Credentials

Edit `tests/helpers.ts` and update the test user credentials:

```typescript
export const TEST_EMPLOYEE = {
  email: 'your-test-employee@email.com',
  password: 'YourPassword123!',
};
```

### 3. Run Tests

Start your dev server first:

```powershell
cd D:\Projects\timetrack-nz\mobile
```

```powershell
npm run dev
```

Then run tests in another terminal:

```powershell
cd D:\Projects\timetrack-nz\tests
```

```powershell
npm test
```

## Test Suites

| File | What it tests |
|------|---------------|
| `auth.spec.ts` | Login, logout, session persistence |
| `clock.spec.ts` | Clock in/out, breaks, GPS |
| `history.spec.ts` | Shift history, map modal |
| `expenses.spec.ts` | Expense submission, categories |
| `chat.spec.ts` | Messaging functionality |
| `navigation.spec.ts` | Tab navigation, UI, safe areas |

## Available Commands

Run all tests:
```powershell
npm test
```

Run on mobile Chrome viewport:
```powershell
npm run test:mobile
```

Run on iPhone viewport:
```powershell
npm run test:iphone
```

Run on desktop viewport:
```powershell
npm run test:desktop
```

Run with visible browser:
```powershell
npm run test:headed
```

Interactive UI mode:
```powershell
npm run test:ui
```

Debug mode:
```powershell
npm run test:debug
```

Show HTML test report:
```powershell
npm run report
```

Record tests by clicking:
```powershell
npm run codegen
```

## Test Against Deployed App

```powershell
$env:TEST_URL="https://app.trackable.co.nz"
```

```powershell
npm test
```

## Recording New Tests

Use Playwright's codegen to record tests by clicking:

```powershell
npm run codegen
```

This opens a browser where your clicks are recorded as test code.

## Viewing Test Reports

After running tests:

```powershell
npm run report
```

Opens HTML report showing:
- Pass/fail status
- Screenshots on failure
- Video recordings
- Trace files for debugging

## Tips

1. **Create a test account** - Don't use real user data. Create a dedicated test employee account.

2. **Clean test data** - Tests may create expenses/messages. Consider cleaning up test data periodically.

3. **Run before each release** - Run full test suite before pushing new builds to TestFlight/Play Store.

4. **Check safe areas** - The `navigation.spec.ts` includes tests for safe area padding that caught the iPhone issues.

## Troubleshooting

### Tests timeout waiting for login

- Check TEST_EMPLOYEE credentials in `helpers.ts`
- Ensure dev server is running on port 5173
- Check Firebase is accessible

### Element not found

- Selectors may need updating if UI changes
- Use `npm run test:debug` to step through

### Browser doesn't open

```powershell
npx playwright install chromium
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run E2E Tests
  run: |
    npm ci
    npx playwright install --with-deps
    npm test
  env:
    TEST_URL: https://app.trackable.co.nz
```
