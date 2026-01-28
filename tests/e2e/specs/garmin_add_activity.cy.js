/**
 * Test E2E mocké: activation plugin Garmin & ajout d'une activité via refresh.
 * On intercepte fetch vers l'API Garmin et renvoie un payload synthétique.
 */
describe('Garmin provider refresh (mock UI flow)', () => {
  beforeEach(() => {
    // Use cy.intercept to mock Garmin API calls
    cy.fixture('garmin_activity').then((garminData) => {
      cy.intercept('GET', '**/activities/fetch**', {
        statusCode: 200,
        body: garminData
      }).as('garminFetch')
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

    // Wait for at least one Garmin API call to complete (data is saved after this)
    cy.wait('@garminFetch', { timeout: 20000 })

    // Small delay to ensure IndexedDB write completes
    cy.wait(1000)

    // Navigate to activities page - don't wait for full sync (takes 90s+)
    cy.visit('/my-activities')
    cy.waitForApp()

    // Verify the activity card exists
    cy.getByTestId('activity-card', { timeout: 8000 }).should('exist')

    // Verify the activity name is present
    cy.contains(/Sortie Test Garmin/i, { timeout: 8000 }).should('exist')
  })
})
