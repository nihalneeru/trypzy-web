import { test, expect } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('/')
  
  // Check that the page loaded (basic smoke test)
  await expect(page).toHaveTitle(/Trypzy/i)
})

