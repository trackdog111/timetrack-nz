# Trackable NZ - Automated E2E Tests

Playwright-based end-to-end tests for Trackable NZ mobile app and dashboard.

---

## Quick Start

### 1. Install

```powershell
cd D:\Projects\timetrack-nz
mkdir tests
cd tests

# Copy all files from this folder into tests/
# Then:

npm install
npx playwright install
```

### 2. Configure Test Credentials

Edit `tests/helpers.ts` and update:
- `TEST_PASSWORD` - Your test account password
- Test email addresses if needed

### 3. Run Tests

```powershell
# Run all tests (headless)
npm test

# Run with browser visible
npm run test:headed

# Run with Playwright UI (best for debugging)
npm run test:ui

# Run specific test file
npm run test:auth
npm run test:clock
npm run test:dashboard
npm run test:tenant

# Test against production URLs
npm run test:prod

# Test against local dev server
npm run test:local
```

---

## Test Files

| File | What it tests |
|------|---------------|
| `auth.spec.ts` | Login, signup, invalid credentials |
| `clock.spec.ts` | Clock in/out, breaks, shift cycle |
| `dashboard.spec.ts` | All dashboard views load correctly |
| `multi-tenant.spec.ts` | Company data isolation |

---

## Before Running Tests

1. **Update TEST_PASSWORD** in `helpers.ts` with your actual password
2. **Ensure test accounts exist**:
   - `info@cityscaffold.co.nz` (manager)
   - `trackdog111@hotmail.com` (employee)
3. **Clock out any active shifts** before running clock tests

---

## Test Results

After running tests:
- Screenshots of failures saved to `test-results/`
- HTML report: `npm run report`

---

## CI/CD Integration (Optional)

### GitHub Actions

Create `.github/workflows/test.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: |
          cd tests
          npm ci
          npx playwright install --with-deps
          
      - name: Run tests
        run: |
          cd tests
          npm run test:prod
        env:
          TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
          
      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: tests/playwright-report/
```

Add `TEST_PASSWORD` to GitHub repo secrets.

---

## Tips

### Running specific tests
```powershell
# Single test by name
npx playwright test -g "should clock in"

# Single file
npx playwright test tests/clock.spec.ts
```

### Debugging
```powershell
# Step through with debugger
npx playwright test --debug

# See browser + Playwright inspector
npx playwright test --headed --debug
```

### Updating snapshots
```powershell
npx playwright test --update-snapshots
```

---

## Folder Structure

```
tests/
├── playwright.config.ts    # Playwright configuration
├── package.json            # Dependencies and scripts
├── README.md               # This file
└── tests/
    ├── helpers.ts          # Shared test utilities
    ├── auth.spec.ts        # Auth tests
    ├── clock.spec.ts       # Clock in/out tests
    ├── dashboard.spec.ts   # Dashboard tests
    └── multi-tenant.spec.ts # Isolation tests
```

---

## Troubleshooting

### "Permission denied" errors in tests
- Check Firestore rules are deployed
- Verify companyId is being set correctly

### Tests timeout
- Increase timeout in `playwright.config.ts`
- Check if app is loading slowly

### Login fails
- Verify TEST_PASSWORD is correct
- Check if account exists in Firebase Auth

### GPS tests fail
- Tests mock geolocation to Auckland coordinates
- Real device tests may need actual GPS
