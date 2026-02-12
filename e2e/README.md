# E2E Tests

End-to-end tests for Tripti using Playwright.

## Setup

### Required Environment Variables

Create a `.env.local` file in the root directory with:

```bash
E2E_EMAIL=your-test-account@example.com
E2E_PASSWORD=your-test-password
```

**Note:** Use a dedicated test account for E2E tests. Do NOT use your personal account.

### Creating a Test Account

1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:3000`
3. Sign up with the credentials you'll use for `E2E_EMAIL` and `E2E_PASSWORD`
4. Create at least one circle (for navigation tests)
5. Optionally create a trip (for more comprehensive testing)

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run with UI (interactive mode)
```bash
npm run test:e2e:ui
```

### Run specific test file
```bash
npx playwright test e2e/trip-lifecycle.spec.ts
```

### Debug mode
```bash
npx playwright test --debug
```

## Test Files

### `navigation.spec.ts`
Tests navigation flows and auth redirects:
- Login always lands on `/dashboard`
- Logout always routes to `/`
- Logo always routes to `/dashboard`
- No navigation bouncing between pages

### `discover-flow.spec.js`
Tests discover feed functionality:
- Discover page visibility
- Global feed default view
- Sign up flow

### `trip-lifecycle.spec.ts` ⭐ **NEW**
Tests the complete trip lifecycle (happy path):
1. Create circle
2. Create trip
3. Submit availability
4. Open voting
5. Vote on dates
6. Lock dates
7. Verify dates locked

Also tests regression:
- Cannot vote after dates are locked

## Test Strategy

### What's Covered in E2E
- Critical user journeys (trip lifecycle)
- Navigation flows
- Auth redirects
- UI interactions across multiple pages

### What's Covered in Unit Tests
- Multi-user coordination (see `tests/api/`)
- Stage enforcement
- Privacy rules
- Business logic

### Why Single-User E2E?
The trip lifecycle test uses a single user to keep it simple and reliable. Multi-user coordination is thoroughly tested in unit tests:
- `trip-stage-enforcement.test.js` - Multi-user voting, blocking logic
- `trip-expenses.test.js` - Multi-user traveler validation
- `trip-privacy-permissions.test.js` - Multi-user privacy rules

## Tips

### Test Data Isolation
- E2E tests create new circles/trips with timestamps (e.g., `E2E Test Trip 1737388800000`)
- This prevents conflicts with existing test data
- You can manually delete old E2E test data from the dashboard

### Flaky Tests
If a test is flaky:
1. Increase timeouts (default: 5000ms)
2. Add `await page.waitForTimeout(500)` between actions
3. Use `test.skip()` for known issues
4. Check console logs for errors

### Debugging
- Use `--debug` flag to run with Playwright Inspector
- Add `await page.pause()` to pause execution at any point
- Check HTML reporter after test run: `npx playwright show-report`

## CI/CD

Tests run in CI with:
- Retries: 2x (in case of flakiness)
- Workers: 1 (sequential execution)
- Fresh server start (no reuse)

See `playwright.config.js` for configuration.
