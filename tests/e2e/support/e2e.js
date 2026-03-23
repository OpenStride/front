// Support file: place for custom commands or global before/after hooks

/**
 * Ignore Service Worker registration errors in tests
 * Cypress doesn't play well with Service Workers
 */
Cypress.on('uncaught:exception', err => {
  // Ignore Service Worker registration failures
  if (err.message.includes('ServiceWorker') || err.message.includes('dev-sw.js')) {
    return false
  }
  // Let other errors fail the test
  return true
})

/**
 * Custom command to select elements by data-test attribute
 * Usage: cy.getByTestId('activity-card')
 */
Cypress.Commands.add('getByTestId', (testId, options = {}) => {
  return cy.get(`[data-test="${testId}"]`, options)
})

/**
 * Custom command to clear all IndexedDB databases
 * Useful for ensuring clean state between tests
 * Usage: cy.clearIndexedDB()
 */
Cypress.Commands.add('clearIndexedDB', () => {
  return cy.window().then(win => {
    return new Promise((resolve, _reject) => {
      if (!win.indexedDB) {
        resolve()
        return
      }

      const DBDeleteRequest = win.indexedDB.deleteDatabase('openStride')

      DBDeleteRequest.onerror = () => {
        console.warn('Error deleting IndexedDB')
        resolve() // Don't fail the test if DB doesn't exist
      }

      DBDeleteRequest.onsuccess = () => {
        console.log('IndexedDB cleared successfully')
        resolve()
      }

      DBDeleteRequest.onblocked = () => {
        console.warn('IndexedDB deletion blocked')
        resolve()
      }
    })
  })
})

/**
 * Custom command to wait for app initialization
 * Waits for Vue app to be mounted and ready
 * Usage: cy.waitForApp()
 */
Cypress.Commands.add('waitForApp', () => {
  // Wait for the main app container to be present
  return cy.get('#app', { timeout: 10000 }).should('exist')
})

/**
 * Custom command to setup a clean test environment
 * Clears IndexedDB and visits a page
 * Usage: cy.setupTest('/data-providers')
 */
Cypress.Commands.add('setupTest', (path = '/') => {
  cy.clearIndexedDB()
  cy.visit(path)
  cy.waitForApp()
})

/**
 * Mock Garmin OAuth2 token exchange and API fetch requests
 * Usage: cy.mockGarminFetch()
 */
Cypress.Commands.add('mockGarminFetch', () => {
  cy.intercept('POST', '**/token', {
    statusCode: 200,
    body: {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      refresh_token_expires_in: 7776000
    }
  }).as('tokenExchange')

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
