import { test, expect } from '@playwright/test'

/**
 * Helper to require environment variables
 */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`)
  }
  return value
}

/**
 * Helper to login
 */
async function login(page: any) {
  const email = requireEnv('E2E_EMAIL')
  const password = requireEnv('E2E_PASSWORD')
  
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  
  // Fill login form
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  
  // Wait for navigation to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
}

test.describe('Navigation and Auth', () => {
  test.beforeEach(async ({ page }) => {
    // Start from login page
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('login always lands on /dashboard', async ({ page }) => {
    const email = requireEnv('E2E_EMAIL')
    const password = requireEnv('E2E_PASSWORD')
    
    // Fill login form
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-password').fill(password)
    await page.getByTestId('login-submit').click()
    
    // Wait for navigation - should go to /dashboard regardless of previous URL
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    
    // Verify URL is exactly /dashboard (not a deep link)
    const url = page.url()
    expect(url).toMatch(/\/dashboard$/)
    
    // Verify dashboard page is visible
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })

  test('logout always routes to "/" and shows login-email', async ({ page }) => {
    // First login
    await login(page)
    
    // Verify we're on dashboard
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    
    // Click logout
    await page.getByTestId('logout').click()
    
    // Wait for navigation to login page
    await page.waitForURL('/', { timeout: 5000 })
    
    // Verify URL is exactly "/" (login page)
    const url = page.url()
    expect(url).toMatch(/^http:\/\/localhost:3000\/$/)
    
    // Verify login form is visible
    await expect(page.getByTestId('login-email')).toBeVisible()
    await expect(page.getByTestId('login-password')).toBeVisible()
  })

  test('dashboard -> circle -> trip does not bounce', async ({ page }) => {
    // Login first
    await login(page)
    
    // Navigate to a circle page
    // First, find a circle card/link on the dashboard
    // For now, we'll assume circles are rendered and accessible
    // You may need to adjust selectors based on your actual UI
    
    // Check if there are circles displayed
    const circleLinks = page.locator('a[href*="/circles/"]').first()
    const circleCount = await page.locator('a[href*="/circles/"]').count()
    
    if (circleCount === 0) {
      test.skip('No circles available to test navigation')
      return
    }
    
    // Click first circle link
    await circleLinks.click()
    await page.waitForURL(/\/circles\/[^/]+/, { timeout: 5000 })
    
    // Verify we're on circle page
    await expect(page.getByTestId('circle-page')).toBeVisible()
    
    // Find a trip card on the circle page
    // Trip cards have testid="trip-card-{tripId}"
    const tripCard = page.locator('[data-testid^="trip-card-"]').first()
    const tripCardCount = await page.locator('[data-testid^="trip-card-"]').count()
    
    if (tripCardCount === 0) {
      test.skip('No trips available to test bounce')
      return
    }
    
    // Get the href before clicking
    const tripHref = await tripCard.getAttribute('href')
    expect(tripHref).toBeTruthy()
    
    // Click trip card
    await tripCard.click()
    
    // Wait for navigation to trip page
    await page.waitForURL(/\/trips\/[^/]+/, { timeout: 5000 })
    
    // Verify URL matches /trips/ pattern
    const urlAfterClick = page.url()
    expect(urlAfterClick).toMatch(/\/trips\/[^/]+/)
    
    // Wait for a short time to detect bounce (800ms as per requirements)
    await page.waitForTimeout(800)
    
    // Verify URL is still /trips/ (no bounce back to circle)
    const urlAfterWait = page.url()
    expect(urlAfterWait).toMatch(/\/trips\/[^/]+/)
    
    // Verify trip page is visible
    await expect(page.getByTestId('trip-page')).toBeVisible({ timeout: 2000 })
  })

  test('logo always routes to /dashboard from circle page', async ({ page }) => {
    // Login first
    await login(page)
    
    // Navigate to a circle page
    const circleLinks = page.locator('a[href*="/circles/"]').first()
    const circleCount = await page.locator('a[href*="/circles/"]').count()
    
    if (circleCount === 0) {
      test.skip('No circles available to test logo navigation')
      return
    }
    
    await circleLinks.click()
    await page.waitForURL(/\/circles\/[^/]+/, { timeout: 5000 })
    
    // Verify we're on circle page
    await expect(page.getByTestId('circle-page')).toBeVisible()
    
    // Click logo
    await page.getByTestId('logo-home').click()
    
    // Wait for navigation to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 5000 })
    
    // Verify URL is /dashboard
    const url = page.url()
    expect(url).toMatch(/\/dashboard$/)
    
    // Verify dashboard page is visible
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })

  test('logo always routes to /dashboard from trip page', async ({ page }) => {
    // Login first
    await login(page)
    
    // Navigate to a trip page
    // First go to a circle, then to a trip
    const circleLinks = page.locator('a[href*="/circles/"]').first()
    const circleCount = await page.locator('a[href*="/circles/"]').count()
    
    if (circleCount === 0) {
      test.skip('No circles available to test logo navigation from trip')
      return
    }
    
    await circleLinks.click()
    await page.waitForURL(/\/circles\/[^/]+/, { timeout: 5000 })
    
    // Find a trip card
    // Trip cards have testid="trip-card-{tripId}"
    const tripCard = page.locator('[data-testid^="trip-card-"]').first()
    const tripCardCount = await page.locator('[data-testid^="trip-card-"]').count()
    
    if (tripCardCount === 0) {
      test.skip('No trips available to test logo navigation from trip')
      return
    }
    
    await tripCard.click()
    await page.waitForURL(/\/trips\/[^/]+/, { timeout: 5000 })
    
    // Verify we're on trip page
    await expect(page.getByTestId('trip-page')).toBeVisible({ timeout: 2000 })
    
    // Click logo (note: logo may be in legacy dashboard header)
    const logoLink = page.getByTestId('logo-home').first()
    await logoLink.click()
    
    // Wait for navigation to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 5000 })
    
    // Verify URL is /dashboard
    const url = page.url()
    expect(url).toMatch(/\/dashboard$/)
    
    // Verify dashboard page is visible
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })
})
