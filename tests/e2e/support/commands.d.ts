/// <reference types="cypress" />

/**
 * Custom Cypress commands for OpenStride E2E tests
 */
declare namespace Cypress {
  interface Chainable {
    /**
     * Custom command to select elements by data-test attribute
     * @param testId - The value of the data-test attribute
     * @example cy.getByTestId('activity-card')
     */
    getByTestId(testId: string): Chainable<JQuery<HTMLElement>>

    /**
     * Custom command to clear all IndexedDB databases
     * Useful for ensuring clean state between tests
     * @example cy.clearIndexedDB()
     */
    clearIndexedDB(): Chainable<void>

    /**
     * Custom command to wait for app initialization
     * Waits for Vue app to be mounted and ready
     * @example cy.waitForApp()
     */
    waitForApp(): Chainable<JQuery<HTMLElement>>

    /**
     * Custom command to setup a clean test environment
     * Clears IndexedDB and visits a page
     * @param path - The path to visit (default: '/')
     * @example cy.setupTest('/data-providers')
     */
    setupTest(path?: string): Chainable<void>

    /**
     * Mock Garmin API fetch requests
     * @example cy.mockGarminFetch()
     */
    mockGarminFetch(): Chainable<void>
  }
}
