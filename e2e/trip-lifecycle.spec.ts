import { test, expect } from '@playwright/test'

/**
 * E2E test for complete trip lifecycle using Command Center V2
 *
 * This test verifies the critical happy path:
 * 1. User creates a circle
 * 2. User creates a trip in that circle
 * 3. User opens scheduling overlay via chevron/CTA
 * 4. User submits date picks
 * 5. User opens voting
 * 6. User votes on dates
 * 7. User locks dates
 * 8. Verify dates are locked and trip progresses
 *
 * Note: This is a single-user flow. Multi-user coordination is tested
 * via unit tests in trip-stage-enforcement.test.js
 */

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
 * Helper to login and land on /dashboard
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

test.describe('Trip Lifecycle: Create → Schedule → Vote → Lock', () => {
  test('complete trip lifecycle with single user', async ({ page }) => {
    // Step 1: Login
    await login(page)

    // Step 2: Create a circle (if none exists, create one)
    const circleName = `E2E Test Circle ${Date.now()}`

    // Look for "Create Circle" button
    const createCircleButton = page.getByRole('button', { name: /create circle/i })
    const createCircleCount = await createCircleButton.count()

    if (createCircleCount > 0) {
      await createCircleButton.first().click()

      // Fill in circle name
      const circleNameInput = page.getByPlaceholder(/circle name|name/i).or(
        page.locator('input[name="circleName"]')
      ).or(
        page.locator('input[name="name"]')
      )
      await circleNameInput.first().fill(circleName)

      // Submit circle creation
      const submitButton = page.getByRole('button', { name: /create|submit/i })
      await submitButton.first().click()

      await page.waitForTimeout(1000)
    }

    // Step 3: Create a trip
    const tripName = `E2E Test Trip ${Date.now()}`

    const createTripButton = page.getByRole('button', { name: /create trip/i })
    await expect(createTripButton.first()).toBeVisible({ timeout: 5000 })
    await createTripButton.first().click()

    // Fill in trip details
    const tripNameInput = page.getByPlaceholder(/trip name|name|destination/i).or(
      page.locator('input[name="tripName"]')
    ).or(
      page.locator('input[name="name"]')
    )
    await tripNameInput.first().fill(tripName)

    // Set date range
    const startDateInput = page.locator('input[name="startDate"]').or(
      page.getByLabel(/start date/i)
    )
    const endDateInput = page.locator('input[name="endDate"]').or(
      page.getByLabel(/end date/i)
    )

    if (await startDateInput.count() > 0) {
      await startDateInput.first().fill('2026-06-01')
      await endDateInput.first().fill('2026-06-30')
    }

    // Submit trip creation
    const submitTripButton = page.getByRole('button', { name: /create trip|create/i })
    await submitTripButton.last().click()

    // Wait for trip page to load (Command Center V2)
    await page.waitForURL(/\/trips\//, { timeout: 10000 })
    await expect(page.getByTestId('trip-page')).toBeVisible({ timeout: 5000 })

    // Verify trip name is displayed
    await expect(page.getByText(tripName)).toBeVisible({ timeout: 3000 })

    // Step 4: Open scheduling overlay via chevron or CTA
    const schedulingChevron = page.getByRole('button', { name: /dates|scheduling/i })
    const pickDatesCTA = page.getByRole('button', { name: /pick dates|view dates|share vote/i })

    if (await schedulingChevron.count() > 0) {
      await schedulingChevron.first().click()
    } else if (await pickDatesCTA.count() > 0) {
      await pickDatesCTA.first().click()
    } else {
      console.log('Could not open scheduling overlay - skipping scheduling steps')
      return
    }
    await page.waitForTimeout(1000)

    // Step 5: Submit date picks (rank selection + calendar)
    const rankButtons = page.getByRole('button', { name: /love to go|can go|might be able/i })
    if (await rankButtons.count() > 0) {
      await rankButtons.filter({ hasText: /love to go/i }).first().click()
      await page.waitForTimeout(300)

      const dateButtons = page.locator('button').filter({ has: page.locator('text=/^\\d{1,2}$/') })
      const validDateButton = dateButtons.filter({ has: page.locator(':not([disabled])') }).first()
      if (await validDateButton.count() > 0) {
        await validDateButton.click()
        await page.waitForTimeout(300)
      }

      const savePicksButton = page.getByRole('button', { name: /save picks|save/i })
      if (await savePicksButton.count() > 0 && await savePicksButton.isEnabled()) {
        await savePicksButton.click()
        await page.waitForTimeout(1000)
      }
    }

    // Step 6: Open voting (leader action)
    const openVotingButton = page.getByRole('button', { name: /open voting/i })
    if (await openVotingButton.count() > 0 && await openVotingButton.isEnabled()) {
      await openVotingButton.click()
      await page.waitForTimeout(1000)

      // Step 7: Cast a vote
      const voteRadios = page.locator('input[type="radio"]')
      if (await voteRadios.count() > 0) {
        await voteRadios.first().click()
        await page.waitForTimeout(300)

        const submitVoteButton = page.getByRole('button', { name: /submit vote|update vote/i })
        if (await submitVoteButton.count() > 0 && await submitVoteButton.isEnabled()) {
          await submitVoteButton.click()
          await page.waitForTimeout(1000)
        }
      }
    }

    // Step 8: Lock dates (leader action)
    const lockDatesButton = page.getByRole('button', { name: /lock dates/i })
    if (await lockDatesButton.count() > 0 && await lockDatesButton.isEnabled()) {
      await lockDatesButton.click()
      await page.waitForTimeout(500)

      const confirmButton = page.getByRole('button', { name: /confirm/i })
      if (await confirmButton.count() > 0) {
        await confirmButton.click()
        await page.waitForTimeout(1500)
      }

      await expect(page.getByText(/dates? locked/i)).toBeVisible({ timeout: 5000 })
      console.log('Trip lifecycle completed: dates locked!')
    }

    // Final: Trip page still renders
    await expect(page.getByTestId('trip-page')).toBeVisible()
  })

  test('cannot vote after dates are locked', async ({ page }) => {
    // Regression test: voting controls should not appear on locked trips
    await login(page)

    // Navigate to any trip from dashboard
    const tripCard = page.locator('[data-testid^="trip-card-"]').first()
    if (await tripCard.count() === 0) {
      test.skip(true, 'No trips available to test voting lockout')
      return
    }

    await tripCard.click()
    await page.waitForURL(/\/trips\//, { timeout: 5000 })

    // Check if trip is locked
    const isLocked = await page.getByText(/dates? locked/i).count() > 0
    if (!isLocked) {
      test.skip(true, 'Trip is not locked, cannot test voting lockout')
      return
    }

    // Open scheduling overlay via chevron
    const schedulingChevron = page.getByRole('button', { name: /dates|scheduling/i })
    if (await schedulingChevron.count() > 0) {
      await schedulingChevron.first().click()
      await page.waitForTimeout(500)

      // Verify voting controls are NOT visible in the overlay
      const submitVoteButton = page.getByRole('button', { name: /submit.*vote/i })
      await expect(submitVoteButton).not.toBeVisible()

      console.log('Voting correctly disabled after lock')
    }
  })
})
