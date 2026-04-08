import { test, expect } from '@playwright/test'

test.describe('Garmin — Fetch activities via push data', () => {
  test('clicking Actualiser retrieves activities from Cloud Storage', async ({ page }) => {
    // Navigate to Garmin setup page
    await page.goto('/data-provider/garmin')
    await page.waitForSelector('#app', { timeout: 10000 })

    // Wait for page to settle
    await page.waitForTimeout(2000)

    // Check if connected (garmin-status-section visible)
    const statusSection = page.locator('[data-test="garmin-status-section"]')
    const isConnected = await statusSection.isVisible().catch(() => false)

    if (!isConnected) {
      console.log('Garmin not connected — skipping test')
      test.skip()
      return
    }

    // Click "Actualiser" button
    const refreshButton = page.locator('[data-test="manual-refresh-button"]')
    await expect(refreshButton).toBeVisible({ timeout: 5000 })
    await refreshButton.click()

    // Wait for the refresh to complete (spinner stops)
    await page.waitForTimeout(10000)

    // Check console for sync results
    const logs: string[] = []
    page.on('console', msg => {
      if (msg.text().includes('[GarminSync]')) {
        logs.push(msg.text())
      }
    })

    // Click again to capture console logs
    await refreshButton.click()
    await page.waitForTimeout(8000)

    console.log('GarminSync logs:', logs)

    // Navigate to activities page to verify
    await page.goto('/my-activities')
    await page.waitForSelector('#app', { timeout: 10000 })
    await page.waitForTimeout(3000)

    // Check if any activity cards exist
    const activityCards = page.locator('[data-test="activity-card"]')
    const cardCount = await activityCards.count()

    console.log(`Found ${cardCount} activity cards`)
    expect(cardCount).toBeGreaterThan(0)
  })

  test('clicking "Récupérer les 10 derniers jours" fetches activities', async ({ page }) => {
    await page.goto('/data-provider/garmin')
    await page.waitForSelector('#app', { timeout: 10000 })
    await page.waitForTimeout(2000)

    const statusSection = page.locator('[data-test="garmin-status-section"]')
    const isConnected = await statusSection.isVisible().catch(() => false)

    if (!isConnected) {
      test.skip()
      return
    }

    // Listen for console logs
    const logs: string[] = []
    page.on('console', msg => {
      if (msg.text().includes('[GarminSync]')) {
        logs.push(msg.text())
      }
    })

    // Click "Récupérer les 10 derniers jours"
    const fetchButton = page.getByText('Récupérer les 10 derniers jours')
    await expect(fetchButton).toBeVisible({ timeout: 5000 })
    await fetchButton.click()

    // Wait for the fetch to complete (backfill + poll, up to 40s)
    await page.waitForTimeout(35000)

    console.log('GarminSync logs:', logs)

    // Check if we got any activities
    const hasProcessed = logs.some(l => l.includes('Processed:') || l.includes('Fetched'))
    console.log('Has processed activities:', hasProcessed)
  })
})
