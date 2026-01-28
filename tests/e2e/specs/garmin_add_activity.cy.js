/**
 * Test E2E mocké: activation plugin Garmin & ajout d'une activité via refresh.
 * On intercepte fetch vers l'API Garmin et renvoie un payload synthétique.
 */
describe('Garmin provider refresh (mock UI flow)', () => {
  beforeEach(() => {
    cy.fixture('garmin_activity').as('garminData')

    // Stub fetch avant navigation (pas de réseau réel, donc pas d'intercepts à attendre)
    cy.on('window:before:load', (win) => {
      const originalFetch = win.fetch.bind(win)
      win.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url
        if (url.includes('/activities/fetch')) {
          return new Promise((resolve) => {
            cy.get('@garminData').then((data) => {
              resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }))
            })
          })
        }
        return originalFetch(input, init)
      }
    })
  })

  it('active le provider Garmin, injecte les tokens via query et récupère une activité', () => {
    // Setup clean test environment (use direct profile URL instead of redirect)
    cy.setupTest('/profile?tab=data-sources')

    // Wait for the data sources tab content to be visible
    cy.getByTestId('available-providers-section', { timeout: 10000 }).should('be.visible')
    cy.getByTestId('available-providers-title').should('be.visible')

    // Find and enable the Garmin provider
    cy.getByTestId('available-provider-garmin').within(() => {
      cy.getByTestId('add-provider-garmin').click()
    })

    // Wait for the provider to be moved from available to connected
    // First, wait for it to disappear from available list
    cy.getByTestId('available-provider-garmin').should('not.exist')

    // Then wait for it to appear in connected list (longer timeout for IndexedDB operation)
    cy.getByTestId('connected-provider-garmin', { timeout: 10000 }).should('be.visible')

    // Wait a bit for Vue to finish rendering the router-link
    cy.wait(500)

    // Click Configure to go to the Garmin setup page
    // Use .within() to ensure we click on the correct element and scroll it into view
    cy.getByTestId('connected-provider-garmin').within(() => {
      cy.getByTestId('configure-provider-garmin')
        .should('be.visible')
        .scrollIntoView()
        .click()
    })

    // Wait for navigation to complete
    cy.url({ timeout: 10000 }).should('match', /data-provider\/garmin/)

    // Simule retour OAuth avec tokens - l'import démarre automatiquement
    cy.visit('/data-provider/garmin?access_token=T&access_token_secret=S')

    // Wait for the app to be ready
    cy.waitForApp()

    // Wait for the status section to appear (indicates connection is established)
    cy.getByTestId('garmin-status-section', { timeout: 10000 }).should('be.visible')

    // Wait for automatic import to complete - check for "Synchronisé" text or manual refresh button
    cy.getByTestId('manual-refresh-button', { timeout: 15000 }).should('be.visible')

    // Navigate to activities page and verify the activity was imported
    cy.visit('/my-activities')
    cy.waitForApp()

    // Verify the activity card exists
    cy.getByTestId('activity-card', { timeout: 8000 }).should('exist')

    // Verify the activity name is present
    cy.contains(/Sortie Test Garmin/i, { timeout: 8000 }).should('exist')
  })
})
