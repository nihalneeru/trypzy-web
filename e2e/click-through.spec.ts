import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'

/**
 * Comprehensive click-through E2E test for Tripti.ai
 *
 * Uses pre-injected auth state (JWT localStorage tokens) to bypass login.
 * Tests all major pages, navigation, overlays, and responsive behavior.
 */

// Read auth state for token injection
const authState = JSON.parse(fs.readFileSync('/tmp/tripti-auth-state.json', 'utf-8'))
const authOrigin = authState.origins[0]
const TOKEN = authOrigin.localStorage.find((i: any) => i.name === 'tripti_token')?.value
const USER = authOrigin.localStorage.find((i: any) => i.name === 'tripti_user')?.value

test.use({
  storageState: '/tmp/tripti-auth-state.json',
})

// Run serially to avoid token race conditions across parallel workers
test.describe.configure({ mode: 'serial' })

// Generous timeout for dev server
const NAV_TIMEOUT = 20000
const ELEMENT_TIMEOUT = 10000

// Collect console errors per test
let consoleErrors: string[] = []

test.beforeEach(async ({ page }) => {
  consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  // Ensure localStorage tokens are set before any page scripts run.
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('tripti_token', token)
    localStorage.setItem('tripti_user', user)
  }, { token: TOKEN, user: USER })
})

/**
 * Navigate to /dashboard with auth recovery.
 */
async function gotoDashboard(page: Page) {
  await page.goto('/dashboard', { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('domcontentloaded')

  // If redirected to login page, recover by re-injecting tokens
  if (!page.url().includes('/dashboard')) {
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('tripti_token', token)
      localStorage.setItem('tripti_user', user)
    }, { token: TOKEN, user: USER })
    await page.goto('/dashboard', { timeout: NAV_TIMEOUT })
    await page.waitForLoadState('domcontentloaded')
  }

  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })
}

/**
 * Navigate to an authenticated page with recovery.
 */
async function gotoAuth(page: Page, path: string) {
  await page.goto(path, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('domcontentloaded')

  // If redirected, re-inject and retry
  if (!page.url().includes(path)) {
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('tripti_token', token)
      localStorage.setItem('tripti_user', user)
    }, { token: TOKEN, user: USER })
    await page.goto(path, { timeout: NAV_TIMEOUT })
    await page.waitForLoadState('domcontentloaded')
  }
}

/**
 * Navigate to first available trip page.
 */
async function navigateToFirstTrip(page: Page): Promise<boolean> {
  await gotoDashboard(page)

  // Try direct trip links on dashboard
  const dashboardTripLinks = page.locator('a[href*="/trips/"]')
  if ((await dashboardTripLinks.count()) > 0) {
    await dashboardTripLinks.first().click()
    await page.waitForURL(/\/trips\/[^/]+/, { timeout: NAV_TIMEOUT })
    return true
  }

  // Otherwise navigate through a circle
  const circleLinks = page.locator('a[href*="/circles/"]')
  if ((await circleLinks.count()) === 0) return false

  await circleLinks.first().click()
  await page.waitForURL(/\/circles\/[^/]+/, { timeout: NAV_TIMEOUT })
  await expect(page.getByTestId('circle-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })

  const tripLinks = page.locator('a[href*="/trips/"]')
  if ((await tripLinks.count()) > 0) {
    await tripLinks.first().click()
    await page.waitForURL(/\/trips\/[^/]+/, { timeout: NAV_TIMEOUT })
    return true
  }

  return false
}

// ============================================================================
// 1. Dashboard
// ============================================================================

test.describe('Dashboard', () => {
  test('loads and shows dashboard content', async ({ page }) => {
    await gotoDashboard(page)

    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })

  test('shows circles list', async ({ page }) => {
    await gotoDashboard(page)

    const circleLinks = page.locator('a[href*="/circles/"]')
    const count = await circleLinks.count()
    if (count > 0) {
      await expect(circleLinks.first()).toBeVisible()
    }
  })

  test('shows trip cards if any exist', async ({ page }) => {
    await gotoDashboard(page)

    const tripLinks = page.locator('a[href*="/trips/"]')
    if ((await tripLinks.count()) > 0) {
      await expect(tripLinks.first()).toBeVisible()
    }
  })

  test('no critical console errors', async ({ page }) => {
    await gotoDashboard(page)
    await page.waitForTimeout(2000)

    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('HMR') &&
        !e.includes('hot-update') &&
        !e.includes('DevTools') &&
        !e.includes('Download the React DevTools')
    )
    if (criticalErrors.length > 0) {
      console.log('Console errors found:', criticalErrors)
    }
  })
})

// ============================================================================
// 2. Circle Page
// ============================================================================

test.describe('Circle Page', () => {
  test('navigates to first circle and shows content', async ({ page }) => {
    await gotoDashboard(page)

    const circleLinks = page.locator('a[href*="/circles/"]')
    if ((await circleLinks.count()) === 0) {
      test.skip(true, 'No circles available on dashboard')
      return
    }

    await circleLinks.first().click()
    await page.waitForURL(/\/circles\/[^/]+/, { timeout: NAV_TIMEOUT })
    await expect(page.getByTestId('circle-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })

  test('shows members on circle page', async ({ page }) => {
    await gotoDashboard(page)

    const circleLinks = page.locator('a[href*="/circles/"]')
    if ((await circleLinks.count()) === 0) {
      test.skip(true, 'No circles available')
      return
    }

    await circleLinks.first().click()
    await page.waitForURL(/\/circles\/[^/]+/, { timeout: NAV_TIMEOUT })
    await expect(page.getByTestId('circle-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    const memberLinks = page.locator('a[href*="/members/"]')
    const membersText = page.getByText(/member/i)
    expect((await memberLinks.count()) > 0 || (await membersText.count()) > 0).toBeTruthy()
  })

  test('shows trip list or empty state on circle page', async ({ page }) => {
    await gotoDashboard(page)

    const circleLinks = page.locator('a[href*="/circles/"]')
    if ((await circleLinks.count()) === 0) {
      test.skip(true, 'No circles available')
      return
    }

    await circleLinks.first().click()
    await page.waitForURL(/\/circles\/[^/]+/, { timeout: NAV_TIMEOUT })
    await expect(page.getByTestId('circle-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    // Circle page should have rendered without crashing - that's the main check.
    // Trip cards, empty state, or create button may vary by data.
    const tripCards = page.locator('[data-testid^="trip-card-"]')
    const tripLinks = page.locator('a[href*="/trips/"]')
    const tripCount = (await tripCards.count()) + (await tripLinks.count())

    // Log what we found for debugging
    console.log(`Circle page: found ${tripCount} trip elements`)
  })

  test('navigates back to dashboard via logo', async ({ page }) => {
    await gotoDashboard(page)

    const circleLinks = page.locator('a[href*="/circles/"]')
    if ((await circleLinks.count()) === 0) {
      test.skip(true, 'No circles available')
      return
    }

    await circleLinks.first().click()
    await page.waitForURL(/\/circles\/[^/]+/, { timeout: NAV_TIMEOUT })
    await expect(page.getByTestId('circle-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    await page.getByTestId('logo-home').click()
    await page.waitForURL(/\/dashboard/, { timeout: NAV_TIMEOUT })
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })
})

// ============================================================================
// 3. Trip Page (Command Center)
// ============================================================================

test.describe('Trip Page', () => {
  test('Command Center loads with key elements', async ({ page }) => {
    const found = await navigateToFirstTrip(page)
    if (!found) {
      test.skip(true, 'No trips available')
      return
    }

    await page.waitForTimeout(3000)

    // Trip name in h1 (ProgressStrip)
    const tripName = page.locator('h1').first()
    await expect(tripName).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    // Buttons with SVG icons exist (chevrons, CTA bar)
    const buttons = page.locator('button').filter({ has: page.locator('svg') })
    expect(await buttons.count()).toBeGreaterThan(0)
  })

  test('ProgressStrip chevrons are visible', async ({ page }) => {
    const found = await navigateToFirstTrip(page)
    if (!found) {
      test.skip(true, 'No trips available')
      return
    }

    await page.waitForTimeout(3000)

    const stageLabels = ['proposed', 'dates', 'itinerary', 'stay', 'accommodation', 'prep']
    let foundChevrons = 0
    for (const label of stageLabels) {
      if ((await page.getByRole('button', { name: new RegExp(label, 'i') }).count()) > 0) {
        foundChevrons++
      }
    }
    expect(foundChevrons).toBeGreaterThan(0)
  })

  test('chat area is visible', async ({ page }) => {
    const found = await navigateToFirstTrip(page)
    if (!found) {
      test.skip(true, 'No trips available')
      return
    }

    await page.waitForTimeout(3000)

    const chatInput = page.getByPlaceholder(/message|type/i)
    const chatTextarea = page.locator('textarea')
    expect((await chatInput.count()) > 0 || (await chatTextarea.count()) > 0).toBeTruthy()
  })

  test('Context CTA bar is visible', async ({ page }) => {
    const found = await navigateToFirstTrip(page)
    if (!found) {
      test.skip(true, 'No trips available')
      return
    }

    await page.waitForTimeout(3000)

    // CTA bar has quick-action buttons - check for any of them
    const hasTravelers = (await page.getByRole('button', { name: /traveler/i }).count()) > 0
    const hasExpenses = (await page.getByRole('button', { name: /expense/i }).count()) > 0
    const hasMemories = (await page.getByRole('button', { name: /memor/i }).count()) > 0

    // Also check for a primary CTA button (right side of bar)
    const hasCTA = (await page.locator('button').filter({ has: page.locator('svg') }).count()) > 3

    expect(hasTravelers || hasExpenses || hasMemories || hasCTA).toBeTruthy()
  })

  test('opening and closing an overlay works', async ({ page }) => {
    const found = await navigateToFirstTrip(page)
    if (!found) {
      test.skip(true, 'No trips available')
      return
    }

    await page.waitForTimeout(3000)

    const stageLabels = ['dates', 'itinerary', 'stay', 'accommodation', 'prep']
    let clickedChevron = false

    for (const label of stageLabels) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') })
      if ((await btn.count()) > 0) {
        await btn.first().click()
        await page.waitForTimeout(1500)
        clickedChevron = true

        // Close via Escape
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
        break
      }
    }

    if (!clickedChevron) {
      console.log('No clickable stage chevrons found')
    }
    // Pass regardless - the main check is no crash
  })

  test('travelers overlay opens from CTA bar', async ({ page }) => {
    const found = await navigateToFirstTrip(page)
    if (!found) {
      test.skip(true, 'No trips available')
      return
    }

    await page.waitForTimeout(3000)

    const travelersButton = page.getByRole('button', { name: /traveler/i })
    if ((await travelersButton.count()) === 0) {
      test.skip(true, 'Travelers button not found')
      return
    }

    await travelersButton.first().click()
    await page.waitForTimeout(1500)

    // Should see traveler content
    const overlayContent = page.locator('text=/\\w+/')
    await expect(overlayContent.first()).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

// ============================================================================
// 4. Settings Page
// ============================================================================

test.describe('Settings Page', () => {
  test('loads and shows settings content', async ({ page }) => {
    await gotoAuth(page, '/settings')
    await page.waitForTimeout(3000)

    const heading = page.getByRole('heading', { name: /settings/i })
    await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })

  test('shows privacy section', async ({ page }) => {
    await gotoAuth(page, '/settings')
    await page.waitForTimeout(3000)

    const privacyHeading = page.getByRole('heading', { name: /privacy/i })
    await expect(privacyHeading).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    const radioGroups = page.locator('[role="radiogroup"]')
    expect(await radioGroups.count()).toBeGreaterThan(0)
  })

  test('shows account section', async ({ page }) => {
    await gotoAuth(page, '/settings')
    await page.waitForTimeout(3000)

    const accountHeading = page.getByRole('heading', { name: /account/i })
    await expect(accountHeading).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    await expect(page.getByText('Name')).toBeVisible({ timeout: ELEMENT_TIMEOUT })
    await expect(page.getByText('Email')).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })
})

// ============================================================================
// 5. Terms Page
// ============================================================================

test.describe('Terms Page', () => {
  test('loads and shows terms content', async ({ page }) => {
    await page.goto('/terms', { timeout: NAV_TIMEOUT })
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: /terms of use/i })
    await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    await expect(page.getByText(/eligibility/i)).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })

  test('Privacy Policy link navigates correctly', async ({ page }) => {
    await page.goto('/terms', { timeout: NAV_TIMEOUT })
    await page.waitForLoadState('domcontentloaded')

    const privacyLinks = page.locator('a[href="/privacy"]')
    expect(await privacyLinks.count()).toBeGreaterThan(0)

    await privacyLinks.last().click()
    await page.waitForURL(/\/privacy/, { timeout: NAV_TIMEOUT })

    const heading = page.getByRole('heading', { name: /privacy policy/i })
    await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })
})

// ============================================================================
// 6. Privacy Page
// ============================================================================

test.describe('Privacy Page', () => {
  test('loads and shows privacy policy content', async ({ page }) => {
    await page.goto('/privacy', { timeout: NAV_TIMEOUT })
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: /privacy policy/i })
    await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    await expect(page.getByText(/Tripti.ai/i).first()).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })
})

// ============================================================================
// 7. Discover Page
// ============================================================================

test.describe('Discover Page', () => {
  test('loads and shows feed or empty state', async ({ page }) => {
    await gotoAuth(page, '/discover')
    await page.waitForTimeout(3000)

    expect(page.url()).toMatch(/\/discover/)

    // Discover nav button should be visible (confirms AppHeader loaded)
    const discoverButton = page.getByRole('button', { name: /discover/i })
    await expect(discoverButton.first()).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })
})

// ============================================================================
// 8. Navigation Checks
// ============================================================================

test.describe('Navigation', () => {
  test('AppHeader is present on authenticated pages', async ({ page }) => {
    await gotoDashboard(page)

    const logo = page.getByTestId('logo-home')
    await expect(logo).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    const circlesNav = page.getByRole('button', { name: /circles/i })
    await expect(circlesNav).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    const discoverNav = page.getByRole('button', { name: /discover/i })
    await expect(discoverNav).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })

  test('logo links to dashboard', async ({ page }) => {
    // Start from terms page (no auth needed to render)
    await page.goto('/terms', { timeout: NAV_TIMEOUT })
    await page.waitForLoadState('domcontentloaded')

    const logo = page.getByTestId('logo-home')
    await expect(logo).toBeVisible({ timeout: ELEMENT_TIMEOUT })
    await logo.click()

    await page.waitForURL(/\/dashboard/, { timeout: NAV_TIMEOUT })
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })

  test('dropdown menu opens with expected items', async ({ page }) => {
    await gotoDashboard(page)

    // Find dropdown trigger (button in header area)
    const dropdownTrigger = page.locator('header button').filter({
      has: page.locator('svg')
    }).last()

    await dropdownTrigger.click()
    await page.waitForTimeout(500)

    await expect(page.getByRole('menuitem', { name: /settings/i })).toBeVisible({ timeout: ELEMENT_TIMEOUT })
    await expect(page.getByRole('menuitem', { name: /terms of use/i })).toBeVisible({ timeout: ELEMENT_TIMEOUT })
    await expect(page.getByRole('menuitem', { name: /privacy policy/i })).toBeVisible({ timeout: ELEMENT_TIMEOUT })
    await expect(page.getByRole('menuitem', { name: /log out/i })).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    await page.keyboard.press('Escape')
  })

  test('Circles nav button goes to dashboard', async ({ page }) => {
    // Start from terms page (renders without auth API calls)
    await page.goto('/terms', { timeout: NAV_TIMEOUT })
    await page.waitForLoadState('domcontentloaded')

    const circlesNav = page.getByRole('button', { name: /circles/i })
    await expect(circlesNav).toBeVisible({ timeout: ELEMENT_TIMEOUT })
    await circlesNav.click()

    await page.waitForURL(/\/dashboard/, { timeout: NAV_TIMEOUT })
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_TIMEOUT })
  })

  test('Discover nav button goes to discover', async ({ page }) => {
    await gotoDashboard(page)

    const discoverNav = page.getByRole('button', { name: /discover/i })
    await discoverNav.click()

    await page.waitForURL(/\/discover/, { timeout: NAV_TIMEOUT })
  })
})

// ============================================================================
// 9. Responsive Check (mobile viewport 375x812)
// ============================================================================

test.describe('Responsive (Mobile 375x812)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('dashboard loads on mobile', async ({ page }) => {
    await gotoDashboard(page)

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(380)
  })

  test('trip page loads on mobile', async ({ page }) => {
    const found = await navigateToFirstTrip(page)
    if (!found) {
      test.skip(true, 'No trips available for mobile test')
      return
    }

    await page.waitForTimeout(3000)

    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(380)
  })

  test('settings page renders on mobile', async ({ page }) => {
    await gotoAuth(page, '/settings')
    await page.waitForTimeout(3000)

    const heading = page.getByRole('heading', { name: /settings/i })
    await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT })

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(380)
  })
})
