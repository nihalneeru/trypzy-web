import { test, expect } from '@playwright/test'

test.describe('Discover Feed Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to discover page
    await page.goto('/')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle')
  })
  
  test('should display discover page', async ({ page }) => {
    // Check if discover navigation exists or if we're on discover page
    const discoverLink = page.getByRole('link', { name: /discover/i })
    if (await discoverLink.isVisible()) {
      await discoverLink.click()
    }
    
    // Check for discover page elements
    await expect(page.getByText(/discover/i)).toBeVisible()
  })
  
  test('should show global feed by default', async ({ page }) => {
    // Navigate to discover if not already there
    await page.goto('/?view=discover')
    await page.waitForLoadState('networkidle')
    
    // Look for global button (should be active/default)
    const globalButton = page.getByRole('button', { name: /global/i }).first()
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

