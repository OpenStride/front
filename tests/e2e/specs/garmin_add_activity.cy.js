/**
 * Test E2E mocké: activation plugin Garmin & ajout d'une activité via OAuth2 PKCE.
 * On intercepte fetch vers le proxy Firebase et renvoie des payloads synthétiques.
 */
describe('Garmin provider refresh (mock UI flow)', () => {
  const MOCK_STATE = 'test-state-12345'
  const MOCK_CODE = 'test-auth-code-67890'

  beforeEach(() => {
    // Mock token exchange (POST /token → returns OAuth2 tokens)
    cy.intercept('POST', '**/token', {
      statusCode: 200,
      body: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        refresh_token_expires_in: 7776000
      }
    }).as('tokenExchange')

    // Mock Garmin API calls via proxy (GET /api/activityDetails*)
    cy.fixture('garmin_activity').then(garminData => {
      cy.intercept('GET', '**/api/activityDetails**', {
        statusCode: 200,
        body: garminData
      }).as('garminFetch')

      cy.intercept('GET', '**/api/backfill/activityDetails**', {
        statusCode: 200,
        body: garminData
      }).as('garminBackfill')
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
      cy.getByTestId('configure-provider-garmin').should('be.visible').scrollIntoView().click()
    })

    // Wait for navigation to complete
    cy.url({ timeout: 10000 }).should('match', /data-provider\/garmin/)

    // Pre-seed sessionStorage with OAuth state for CSRF validation
    cy.window().then(win => {
      win.sessionStorage.setItem('garmin_oauth_state', MOCK_STATE)
      win.sessionStorage.setItem('garmin_pkce_verifier', 'test-verifier-abcdef')
    })

    // Simulate OAuth2 redirect callback with code + state
    cy.visit(`/data-provider/garmin?code=${MOCK_CODE}&state=${MOCK_STATE}`)

    // Wait for the app to be ready
    cy.waitForApp()

    // Wait for the token exchange to complete
    cy.wait('@tokenExchange', { timeout: 10000 })

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
