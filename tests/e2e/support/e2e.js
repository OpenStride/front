// Support file: place for custom commands or global before/after hooks

/**
 * Ignore Service Worker registration errors in tests
 * Cypress doesn't play well with Service Workers
 */
Cypress.on('uncaught:exception', (err) => {
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
  return cy.window().then((win) => {
    return new Promise((resolve, reject) => {
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
 * Mock Garmin API fetch requests
 * Usage: cy.mockGarminFetch()
 */
Cypress.Commands.add('mockGarminFetch', () => {
  cy.fixture('garmin_activity').then((garminData) => {
    cy.intercept('**/activities/fetch**', {
      statusCode: 200,
      body: garminData
    }).as('garminFetch')
  })
})
