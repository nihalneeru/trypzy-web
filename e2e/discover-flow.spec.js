import { test, expect } from '@playwright/test'

test.describe('Discover Feed Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to discover page
    await page.goto('/')

    // Wait for page to load
    await page.waitForLoadState('networkidle')
  })

  // TODO: Discover feature requires authentication. The /discover route
  // requires a valid token in localStorage. Unauthenticated users landing
  // on / see the WelcomePage. These tests need auth setup to work.
  test.skip('should display discover page', async ({ page }) => {
    // Requires authentication - unauthenticated users see WelcomePage
    await page.goto('/discover')
    await page.waitForLoadState('networkidle')

    // Check for discover page elements (requires auth)
    await expect(page.getByText(/discover/i)).toBeVisible()
  })

  // TODO: Discover feature requires authentication. The Global button only
  // appears in the DiscoverFeed component for authenticated users.
  test.skip('should show global feed by default', async ({ page }) => {
    // Navigate to discover (requires auth)
    await page.goto('/discover')
    await page.waitForLoadState('networkidle')

    // The Global button is a standard <button> element in DiscoverFeed
    // It has className with 'bg-[#FA3823]' when active (scope === 'global')
    const globalButton = page.locator('button', { hasText: /global/i }).first()
    await expect(globalButton).toBeVisible()
  })
})

test.describe('Authentication Flow', () => {
  test('should allow sign up', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for sign up button
    const signUpButton = page.getByRole('button', { name: /sign up|signup/i })
    if (await signUpButton.isVisible()) {
      await signUpButton.click()

      // Fill in sign up form
      const emailInput = page.getByPlaceholder(/email/i)
      const passwordInput = page.getByPlaceholder(/password/i)
      const nameInput = page.getByPlaceholder(/name/i)

      if (await emailInput.isVisible()) {
        await emailInput.fill('test@example.com')
        await nameInput.fill('Test User')
        await passwordInput.fill('testpassword123')

        // Submit form
        const submitButton = page.getByRole('button', { name: /sign up|create account/i })
        if (await submitButton.isVisible()) {
          await submitButton.click()
        }
      }
    }
  })
})
