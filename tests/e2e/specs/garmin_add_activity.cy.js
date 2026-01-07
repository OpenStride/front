
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
    cy.visit('/data-providers')
    cy.contains('Available Providers')
    cy.contains('li', 'Garmin').within(() => {
      cy.contains('Add').click()
    })
    cy.contains('Configure').click()
    cy.url().should('match', /data-provider\/garmin/)

    // Simule retour OAuth avec tokens
    cy.visit('/data-provider/garmin?access_token=T&access_token_secret=S')
    cy.contains('Fetch Past Activities').should('be.visible').and('not.be.disabled').click()

    // Laisse le temps au GarminRefresh (7 itérations * ~200ms + traitement)
    cy.wait(2500)

    // Visite la page activités et vérifie la présence de l'activité mock
    cy.visit('/my-activities')
    cy.get('[data-test=activity-card]', { timeout: 8000 }).should('exist')
    cy.contains(/Sortie Test Garmin/i, { timeout: 8000 })
  })
})
