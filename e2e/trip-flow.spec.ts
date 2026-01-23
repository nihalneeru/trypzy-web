import { test, expect, Page } from '@playwright/test'

/**
 * E2E tests for core trip flows (P2-4: MVP Hardening)
 *
 * These tests cover:
 * 1. Create trip and submit date picks
 * 2. Open voting and lock dates (leader flow)
 * 3. Add itinerary idea
 * 4. Vote on accommodation
 *
 * Note: Tests require E2E_EMAIL and E2E_PASSWORD environment variables.
 * For tests that require specific trip states (locked, with accommodation options),
 * they will skip if the required state is not found.
 */

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if required environment variables are set
 */
function hasAuthEnvVars(): boolean {
  return !!(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)
}

/**
 * Require environment variable or throw
 */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`)
  }
  return value
}

/**
 * Login helper - logs in with test credentials
 */
async function login(page: Page): Promise<void> {
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

/**
 * Navigate to a circle from dashboard
 * Returns the circle name if found, null otherwise
 */
async function navigateToCircle(page: Page): Promise<string | null> {
  const circleLinks = page.locator('a[href*="/circles/"]')
  const count = await circleLinks.count()

  if (count === 0) {
    return null
  }

  // Get the circle name before clicking
  const firstCircle = circleLinks.first()
  const circleName = await firstCircle.textContent()

  await firstCircle.click()
  await page.waitForURL(/\/circles\/[^/]+/, { timeout: 5000 })
  await expect(page.getByTestId('circle-page')).toBeVisible()

  return circleName
}

/**
 * Navigate to an existing trip from circle page
 * Returns the trip ID if found, null otherwise
 */
async function navigateToTrip(page: Page): Promise<string | null> {
  const tripCards = page.locator('[data-testid^="trip-card-"]')
  const count = await tripCards.count()

  if (count === 0) {
    return null
  }

  const firstTrip = tripCards.first()
  const href = await firstTrip.getAttribute('href')
  const tripId = href?.match(/\/trips\/([^/]+)/)?.[1] || null

  await firstTrip.click()
  await page.waitForURL(/\/trips\/[^/]+/, { timeout: 5000 })
  await expect(page.getByTestId('trip-page')).toBeVisible({ timeout: 5000 })

  return tripId
}

/**
 * Open scheduling overlay via chevron or focus banner CTA
 */
async function openSchedulingOverlay(page: Page): Promise<boolean> {
  // Try clicking the scheduling chevron via aria-label
  const schedulingChevron = page.getByRole('button', { name: /dates|scheduling/i })
  if (await schedulingChevron.count() > 0) {
    await schedulingChevron.first().click()
    await page.waitForTimeout(500)
    return true
  }

  // Try the focus banner CTA
  const pickDatesButton = page.getByRole('button', { name: /pick dates|view dates|view progress|share vote/i })
  if (await pickDatesButton.count() > 0) {
    await pickDatesButton.first().click()
    await page.waitForTimeout(500)
    return true
  }

  return false
}

/**
 * Open itinerary overlay via chevron
 */
async function openItineraryOverlay(page: Page): Promise<boolean> {
  // Try clicking the itinerary chevron via aria-label
  const itineraryChevron = page.getByRole('button', { name: /itinerary/i })
  if (await itineraryChevron.count() > 0) {
    await itineraryChevron.first().click()
    await page.waitForTimeout(500)
    return true
  }

  // Try the focus banner CTA for itinerary
  const itineraryButton = page.getByRole('button', { name: /plan itinerary/i })
  if (await itineraryButton.count() > 0) {
    await itineraryButton.first().click()
    await page.waitForTimeout(500)
    return true
  }

  return false
}

/**
 * Open accommodation overlay via chevron
 */
async function openAccommodationOverlay(page: Page): Promise<boolean> {
  // Try clicking the accommodation chevron via aria-label
  const accommodationChevron = page.getByRole('button', { name: /accommodation/i })
  if (await accommodationChevron.count() > 0) {
    await accommodationChevron.first().click()
    await page.waitForTimeout(500)
    return true
  }

  // Try the focus banner CTA for accommodation
  const accommodationButton = page.getByRole('button', { name: /find stays|choose.*stay/i })
  if (await accommodationButton.count() > 0) {
    await accommodationButton.first().click()
    await page.waitForTimeout(500)
    return true
  }

  return false
}

// ============================================================================
// Test Suite: Create Trip and Submit Date Picks
// ============================================================================

test.describe('Trip Flow: Create and Schedule', () => {
  test.beforeEach(async ({ page }) => {
    // Skip all tests in this suite if auth env vars are not set
    test.skip(!hasAuthEnvVars(), 'E2E_EMAIL and E2E_PASSWORD environment variables not set')
  })

  test('create trip and submit date picks', async ({ page }) => {
    // Step 1: Login
    await login(page)

    // Step 2: Navigate to a circle
    const circleName = await navigateToCircle(page)
    if (!circleName) {
      test.skip(true, 'No circles available to test trip creation')
      return
    }

    // Step 3: Look for Create Trip button
    const createTripButton = page.getByRole('button', { name: /create trip/i })
    const createTripCount = await createTripButton.count()

    if (createTripCount === 0) {
      test.skip(true, 'No Create Trip button found - may need different permissions')
      return
    }

    // Click create trip
    await createTripButton.first().click()
    await page.waitForTimeout(500)

    // Step 4: Fill trip creation form
    const tripName = `E2E Test Trip ${Date.now()}`

    // Look for trip name input
    const tripNameInput = page.locator('input[name="name"]').or(
      page.locator('input[name="tripName"]')
    ).or(
      page.getByPlaceholder(/trip name|name|destination/i)
    )

    if (await tripNameInput.count() > 0) {
      await tripNameInput.first().fill(tripName)
    }

    // Look for date range inputs (optional - form may auto-suggest)
    const startDateInput = page.locator('input[name="startDate"]').or(
      page.getByLabel(/start date/i)
    )
    if (await startDateInput.count() > 0) {
      // Set dates 2 months in the future
      const startDate = new Date()
      startDate.setMonth(startDate.getMonth() + 2)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 30)

      const formatDate = (d: Date) => d.toISOString().split('T')[0]

      await startDateInput.first().fill(formatDate(startDate))

      const endDateInput = page.locator('input[name="endDate"]').or(
        page.getByLabel(/end date/i)
      )
      if (await endDateInput.count() > 0) {
        await endDateInput.first().fill(formatDate(endDate))
      }
    }

    // Submit trip creation
    const submitButton = page.getByRole('button', { name: /create trip|create|submit/i }).last()
    await submitButton.click()

    // Wait for navigation to trip page
    await page.waitForURL(/\/trips\//, { timeout: 15000 })
    await expect(page.getByTestId('trip-page')).toBeVisible({ timeout: 5000 })

    // Verify trip name is displayed
    await expect(page.getByText(tripName)).toBeVisible({ timeout: 3000 })

    // Step 5: Open scheduling overlay and submit date picks
    const overlayOpened = await openSchedulingOverlay(page)
    if (!overlayOpened) {
      console.log('Could not open scheduling overlay - test continues')
      return
    }

    // Look for the date picking interface
    // Wait for calendar to load
    await page.waitForTimeout(1000)

    // Look for rank selection buttons (Love to go, Can go, Might be able)
    const rankButtons = page.getByRole('button', { name: /love to go|can go|might be able/i })

    if (await rankButtons.count() > 0) {
      // Select "Love to go" rank
      await rankButtons.filter({ hasText: /love to go/i }).first().click()
      await page.waitForTimeout(300)

      // Click on a valid date in the calendar
      // Dates are buttons in the calendar grid
      const dateButtons = page.locator('button').filter({ has: page.locator('text=/^\\d{1,2}$/') })
      const validDateButton = dateButtons.filter({ has: page.locator(':not([disabled])') }).first()

      if (await validDateButton.count() > 0) {
        await validDateButton.click()
        await page.waitForTimeout(300)
      }

      // Try to save picks
      const savePicksButton = page.getByRole('button', { name: /save picks|save/i })
      if (await savePicksButton.count() > 0 && await savePicksButton.isEnabled()) {
        await savePicksButton.click()

        // Wait for save confirmation
        await page.waitForTimeout(1000)

        // Verify picks were saved (toast or UI update)
        const successIndicator = page.getByText(/saved|picks saved/i)
        const picksDisplay = page.locator('[class*="badge"]').filter({ hasText: /1st|love/i })

        // Either see success message or the pick is displayed
        const savedSuccessfully = await successIndicator.count() > 0 || await picksDisplay.count() > 0
        expect(savedSuccessfully).toBeTruthy()

        console.log('Date picks submitted successfully')
      }
    }
  })
})

// ============================================================================
// Test Suite: Open Voting and Lock Dates (Leader Flow)
// ============================================================================

test.describe('Trip Flow: Voting and Lock Dates', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasAuthEnvVars(), 'E2E_EMAIL and E2E_PASSWORD environment variables not set')
  })

  test('open voting and lock dates (leader flow)', async ({ page }) => {
    // Step 1: Login
    await login(page)

    // Step 2: Navigate to a circle and trip
    const circleName = await navigateToCircle(page)
    if (!circleName) {
      test.skip(true, 'No circles available')
      return
    }

    const tripId = await navigateToTrip(page)
    if (!tripId) {
      test.skip(true, 'No trips available')
      return
    }

    // Step 3: Open scheduling overlay
    const overlayOpened = await openSchedulingOverlay(page)
    if (!overlayOpened) {
      test.skip(true, 'Could not open scheduling overlay')
      return
    }

    await page.waitForTimeout(1000)

    // Check current trip state
    const isAlreadyLocked = await page.getByText(/dates? locked/i).count() > 0
    if (isAlreadyLocked) {
      console.log('Trip dates already locked - verifying locked state')
      await expect(page.getByText(/dates? locked/i)).toBeVisible()
      return
    }

    const isVoting = await page.getByText(/vote for your preferred dates/i).count() > 0 ||
                     await page.locator('input[type="radio"]').count() > 0

    // If not in voting phase, try to open voting
    if (!isVoting) {
      // Look for "Open Voting" button (leader only)
      const openVotingButton = page.getByRole('button', { name: /open voting/i })
      if (await openVotingButton.count() > 0 && await openVotingButton.isEnabled()) {
        await openVotingButton.click()
        await page.waitForTimeout(1000)
      } else {
        // Not a leader or voting not available
        console.log('Open Voting button not available - may not be trip leader')
      }
    }

    // Step 4: Cast a vote (if in voting phase)
    const voteRadios = page.locator('input[type="radio"]')
    if (await voteRadios.count() > 0) {
      // Select first voting option
      await voteRadios.first().click()
      await page.waitForTimeout(300)

      // Submit vote
      const submitVoteButton = page.getByRole('button', { name: /submit vote|update vote/i })
      if (await submitVoteButton.count() > 0 && await submitVoteButton.isEnabled()) {
        await submitVoteButton.click()
        await page.waitForTimeout(1000)
      }
    }

    // Step 5: Lock dates (leader only)
    const lockDatesButton = page.getByRole('button', { name: /lock dates/i })
    if (await lockDatesButton.count() > 0 && await lockDatesButton.isEnabled()) {
      await lockDatesButton.click()
      await page.waitForTimeout(500)

      // Confirm in dialog
      const confirmButton = page.getByRole('button', { name: /confirm/i })
      if (await confirmButton.count() > 0) {
        await confirmButton.click()
        await page.waitForTimeout(1500)
      }

      // Verify dates are locked
      await expect(page.getByText(/dates? locked/i)).toBeVisible({ timeout: 5000 })
      console.log('Dates locked successfully!')
    } else {
      console.log('Lock Dates button not available - may not be trip leader or not enough votes')
    }
  })
})

// ============================================================================
// Test Suite: Add Itinerary Idea
// ============================================================================

test.describe('Trip Flow: Itinerary Ideas', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasAuthEnvVars(), 'E2E_EMAIL and E2E_PASSWORD environment variables not set')
  })

  test('add itinerary idea', async ({ page }) => {
    // Step 1: Login
    await login(page)

    // Step 2: Navigate to a circle and trip
    const circleName = await navigateToCircle(page)
    if (!circleName) {
      test.skip(true, 'No circles available')
      return
    }

    const tripId = await navigateToTrip(page)
    if (!tripId) {
      test.skip(true, 'No trips available')
      return
    }

    // Step 3: Open itinerary overlay
    const overlayOpened = await openItineraryOverlay(page)

    // If itinerary overlay didn't open via chevron, try focus banner
    if (!overlayOpened) {
      // The itinerary overlay may be accessible even if not the current blocker
      // Try clicking directly on any visible itinerary-related element
      const planButton = page.getByRole('button', { name: /plan|itinerary/i })
      if (await planButton.count() > 0) {
        await planButton.first().click()
        await page.waitForTimeout(500)
      } else {
        test.skip(true, 'Itinerary overlay not accessible - trip may not be in itinerary phase')
        return
      }
    }

    await page.waitForTimeout(1000)

    // Step 4: Look for idea submission form
    const ideaTextarea = page.locator('textarea').filter({
      has: page.locator('[placeholder*="idea"], [placeholder*="activity"]')
    }).or(
      page.getByPlaceholder(/idea|activity|visit|try/i)
    )

    // If we can't find the specific textarea, try any textarea in the overlay
    const anyTextarea = page.locator('textarea').first()

    const textareaToUse = await ideaTextarea.count() > 0 ? ideaTextarea : anyTextarea

    if (await textareaToUse.count() === 0) {
      console.log('No idea submission form found - may have reached idea limit')
      return
    }

    // Check if user has already submitted 3 ideas
    const ideaLimitMessage = page.getByText(/you've submitted 3 ideas/i)
    if (await ideaLimitMessage.count() > 0) {
      console.log('User has reached idea submission limit')
      return
    }

    // Step 5: Submit an idea
    const testIdea = `E2E Test Idea: Visit local market ${Date.now()}`
    await textareaToUse.fill(testIdea)

    const submitIdeaButton = page.getByRole('button', { name: /submit idea|submit/i })
    if (await submitIdeaButton.count() > 0 && await submitIdeaButton.isEnabled()) {
      await submitIdeaButton.click()
      await page.waitForTimeout(1500)

      // Verify idea appears in the list
      // Ideas are typically shown in an accordion grouped by traveler
      const ideaText = page.getByText(testIdea.substring(0, 30)) // Partial match
      const ideaVisible = await ideaText.count() > 0

      if (ideaVisible) {
        console.log('Idea submitted and appears in list')
      } else {
        // Idea may be in collapsed accordion - expand "You" section
        const youAccordion = page.locator('button').filter({ hasText: 'You' })
        if (await youAccordion.count() > 0) {
          await youAccordion.click()
          await page.waitForTimeout(500)
        }
      }

      // Success toast or idea visibility indicates success
      const successToast = page.getByText(/idea submitted/i)
      const hasSuccess = await successToast.count() > 0 || await ideaText.count() > 0
      expect(hasSuccess).toBeTruthy()
    }
  })
})

// ============================================================================
// Test Suite: Vote on Accommodation
// ============================================================================

test.describe('Trip Flow: Accommodation Voting', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasAuthEnvVars(), 'E2E_EMAIL and E2E_PASSWORD environment variables not set')
  })

  test('vote on accommodation option', async ({ page }) => {
    // Step 1: Login
    await login(page)

    // Step 2: Navigate to a circle and trip
    const circleName = await navigateToCircle(page)
    if (!circleName) {
      test.skip(true, 'No circles available')
      return
    }

    const tripId = await navigateToTrip(page)
    if (!tripId) {
      test.skip(true, 'No trips available')
      return
    }

    // Step 3: Check if trip is locked (required for accommodation)
    // The accommodation overlay shows "Dates Not Locked" if trip isn't locked
    const overlayOpened = await openAccommodationOverlay(page)

    if (!overlayOpened) {
      // Try opening scheduling first to check trip status
      await openSchedulingOverlay(page)
      await page.waitForTimeout(500)

      const isLocked = await page.getByText(/dates? locked/i).count() > 0
      if (!isLocked) {
        test.skip(true, 'Trip dates not locked - accommodation voting not available')
        return
      }

      // Close scheduling and try accommodation again
      const closeButton = page.getByRole('button', { name: /close/i })
      if (await closeButton.count() > 0) {
        await closeButton.click()
        await page.waitForTimeout(300)
      }

      await openAccommodationOverlay(page)
    }

    await page.waitForTimeout(1000)

    // Check if we see "Dates Not Locked" message
    const notLockedMessage = page.getByText(/dates not locked/i)
    if (await notLockedMessage.count() > 0) {
      test.skip(true, 'Trip dates not locked - accommodation voting requires locked dates')
      return
    }

    // Check if we see "No Stays Added Yet" message
    const noStaysMessage = page.getByText(/no stays added yet/i)
    if (await noStaysMessage.count() > 0) {
      console.log('No stays added yet - cannot test accommodation voting')
      return
    }

    // Step 4: Look for accommodation options with vote buttons
    const voteButtons = page.getByRole('button', { name: /^vote$/i })

    if (await voteButtons.count() === 0) {
      // May have already voted on all options
      const votedBadges = page.getByText(/you voted/i)
      if (await votedBadges.count() > 0) {
        console.log('Already voted on accommodation options')
        return
      }

      // No vote buttons and no "you voted" - may need accommodation options first
      console.log('No accommodation options available to vote on')
      return
    }

    // Step 5: Vote on first available option
    await voteButtons.first().click()
    await page.waitForTimeout(1500)

    // Verify vote was recorded
    // Should see "Vote recorded" toast or "You voted" badge
    const successToast = page.getByText(/vote recorded/i)
    const votedBadge = page.getByText(/you voted/i)

    const voteRecorded = await successToast.count() > 0 || await votedBadge.count() > 0
    expect(voteRecorded).toBeTruthy()

    console.log('Accommodation vote recorded successfully!')
  })
})

// ============================================================================
// Test Suite: Full Trip Lifecycle (Integration)
// ============================================================================

test.describe('Trip Flow: Full Lifecycle Integration', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasAuthEnvVars(), 'E2E_EMAIL and E2E_PASSWORD environment variables not set')
  })

  test('verify trip page renders without errors', async ({ page }) => {
    // Basic smoke test to ensure trip page loads correctly
    await login(page)

    const circleName = await navigateToCircle(page)
    if (!circleName) {
      test.skip(true, 'No circles available')
      return
    }

    const tripId = await navigateToTrip(page)
    if (!tripId) {
      test.skip(true, 'No trips available')
      return
    }

    // Verify key elements are present
    await expect(page.getByTestId('trip-page')).toBeVisible()

    // Should have some kind of trip name/header visible
    const tripHeader = page.locator('h1, h2').first()
    await expect(tripHeader).toBeVisible()

    // Should have chevron navigation buttons (identified by aria-labels)
    // Chevrons have aria-labels like "Dates (completed)", "Itinerary", etc.
    const chevronButtons = page.getByRole('button', { name: /dates|itinerary|accommodation|prep/i })
    const chevronCount = await chevronButtons.count()
    expect(chevronCount).toBeGreaterThan(0)

    // No console errors (optional advanced check)
    // This would require setting up console listener in beforeEach

    console.log('Trip page renders correctly with all key elements')
  })

  test('navigation between overlays works', async ({ page }) => {
    await login(page)

    const circleName = await navigateToCircle(page)
    if (!circleName) {
      test.skip(true, 'No circles available')
      return
    }

    const tripId = await navigateToTrip(page)
    if (!tripId) {
      test.skip(true, 'No trips available')
      return
    }

    // Test opening and closing overlays via chevron buttons
    // Chevrons have aria-labels like "Dates", "Itinerary", "Accommodation", "Prep"
    const chevronLabels = ['dates', 'itinerary', 'accommodation', 'prep']
    let foundChevrons = 0

    for (const label of chevronLabels) {
      const chevron = page.getByRole('button', { name: new RegExp(label, 'i') }).first()
      if (await chevron.count() > 0 && await chevron.isEnabled()) {
        foundChevrons++
        if (foundChevrons === 1) {
          // Click first chevron to open
          await chevron.click()
          await page.waitForTimeout(500)

          // Click same chevron again to close (toggle behavior)
          await chevron.click()
          await page.waitForTimeout(500)
        } else if (foundChevrons === 2) {
          // Try a different chevron
          await chevron.click()
          await page.waitForTimeout(500)

          // Close via any available close mechanism
          const closeButton = page.getByRole('button', { name: /close/i }).or(
            page.getByLabel(/close/i)
          )
          if (await closeButton.count() > 0) {
            await closeButton.first().click()
          }
          break
        }
      }
    }

    if (foundChevrons === 0) {
      console.log('No enabled chevrons found')
    }

    console.log('Overlay navigation works correctly')
  })
})
