# Testing Guide

## Quick Start

**Run tests in watch mode (automatically runs on file changes):**
```bash
npm run test:watch
```

This will:
- ✅ Run tests automatically when you save files
- ✅ Only re-run affected tests (fast!)
- ✅ Show pass/fail status in terminal
- ✅ Keep running until you stop it (Ctrl+C)

## All Test Commands

```bash
# Run tests once
npm test

# Watch mode - runs tests on file changes (RECOMMENDED)
npm run test:watch

# UI mode - interactive test runner
npm run test:ui

# E2E tests (Playwright) - requires dev server running
npm run test:e2e

# E2E tests with UI
npm run test:e2e:ui
```

## Test Structure

```
├── lib/__tests__/          # Unit tests for utility functions
│   └── trip-consensus.test.ts  ✅ Tests consensus calculation
├── e2e/                    # End-to-end tests (Playwright)
│   └── (add E2E tests here)
└── vitest.config.ts        # Vitest configuration
```

## Current Test Coverage

✅ **trip-consensus.test.ts** - Tests for:
- Date/day string conversion (timezone-safe)
- OptionKey generation and parsing
- Consensus calculation (deterministic)
- Score calculation (available=1, maybe=0.5)

## Writing New Tests

### Unit Tests (Vitest)

Create a file: `lib/__tests__/your-function.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { yourFunction } from '../your-function'

describe('yourFunction', () => {
  it('does something', () => {
    expect(yourFunction()).toBe(expected)
  })
})
```

### E2E Tests (Playwright)

Create a file: `e2e/your-flow.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('user flow', async ({ page }) => {
  await page.goto('/your-page')
  // Test implementation
})
```

## Watch Mode Workflow

1. **Start watch mode:**
   ```bash
   npm run test:watch
   ```

2. **Make changes to your code**

3. **Tests run automatically** - you'll see:
   - ✅ Green checkmarks for passing tests
   - ❌ Red X for failing tests
   - File paths showing what changed

4. **Fix issues** - tests re-run automatically

5. **Stop when done:** Press `Ctrl+C`

## CI/CD

Tests run automatically on:
- Push to main/develop branches
- Pull requests

See `.github/workflows/test.yml` for configuration.

## Troubleshooting

### Tests not running
- ✅ Dependencies installed? Run `npm install`
- ✅ Test files match pattern? `*.test.ts` or `*.spec.ts`
- ✅ Check file is not in `exclude` in `vitest.config.ts`

### Watch mode not detecting changes
- ✅ Using `npm run test:watch`?
- ✅ File saved? Some editors require explicit save
- ✅ Check file watchers limit: `echo fs.inotify.max_user_watches` (Linux)

### Timezone issues in tests
- ✅ Use `dayStringToDate()` helper for creating test dates
- ✅ Always use UTC dates in tests

### E2E tests failing
- ✅ Dev server running? Or use `webServer` config
- ✅ Browser drivers installed? `npx playwright install`

## Tips

- **Keep watch mode running** while developing
- **Write tests first** (TDD) for new features
- **Test edge cases** - empty arrays, null values, etc.
- **Keep tests fast** - unit tests should be < 1ms each
- **Use descriptive test names** - "should return top 3 options when availabilities provided"
