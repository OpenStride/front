# Guide des Tests E2E avec Cypress

Ce guide explique comment écrire et exécuter des tests end-to-end (E2E) pour OpenStride en utilisant Cypress.

## Table des matières

1. [Prérequis](#prérequis)
2. [Lancer les tests](#lancer-les-tests)
3. [Commandes Cypress personnalisées](#commandes-cypress-personnalisées)
4. [Écrire de nouveaux tests](#écrire-de-nouveaux-tests)
5. [Bonnes pratiques](#bonnes-pratiques)
6. [Résolution de problèmes](#résolution-de-problèmes)

## Prérequis

Avant de lancer les tests E2E, assurez-vous que :

1. Les dépendances sont installées : `npm install`
2. Le serveur de développement est démarré : `npm run dev` (dans un terminal séparé)
   - Le serveur doit être accessible sur `http://localhost:3000`

## Lancer les tests

### Mode headless (CI/CD)

Pour lancer tous les tests en mode headless (sans interface graphique) :

```bash
npm run test:e2e
```

Cette commande :
- Lance tous les tests dans un navigateur Electron
- Génère des screenshots en cas d'échec
- Affiche les résultats dans le terminal

### Mode interactif (développement)

**RECOMMANDÉ pour le développement :** Pour voir les tests s'exécuter en temps réel avec l'interface Cypress :

```bash
npx cypress open
```

Cette commande ouvre l'interface graphique de Cypress où vous pouvez :
- ✅ **Voir l'application en temps réel** pendant l'exécution des tests
- ✅ Sélectionner les tests à exécuter individuellement
- ✅ Déboguer facilement avec les DevTools
- ✅ Voir les étapes du test au fur et à mesure
- ✅ Rejouer les tests à volonté

**Étapes dans l'interface Cypress :**
1. Cliquez sur "E2E Testing"
2. Choisissez un navigateur (Chrome, Firefox, Edge, Electron)
3. Cliquez sur "Start E2E Testing"
4. Sélectionnez un fichier de test (ex: `garmin_add_activity.cy.js`)
5. Regardez le test s'exécuter dans le navigateur à droite !

### Lancer un test spécifique

Pour lancer un seul fichier de test en mode headless :

```bash
npx cypress run --spec "tests/e2e/specs/garmin_add_activity.cy.js"
```

## Commandes Cypress personnalisées

OpenStride fournit des commandes Cypress personnalisées pour simplifier l'écriture des tests.

### `cy.getByTestId(testId)`

Sélectionne un élément par son attribut `data-test`.

```javascript
// Au lieu de :
cy.get('[data-test="activity-card"]')

// Utilisez :
cy.getByTestId('activity-card')
```

### `cy.clearIndexedDB()`

Supprime toutes les bases de données IndexedDB pour garantir un état propre entre les tests.

```javascript
beforeEach(() => {
  cy.clearIndexedDB()
})
```

### `cy.waitForApp()`

Attend que l'application Vue soit montée et prête.

```javascript
cy.visit('/data-providers')
cy.waitForApp()
```

### `cy.setupTest(path)`

Nettoie IndexedDB, visite une page et attend que l'app soit prête (combine les trois commandes ci-dessus).

```javascript
// Au lieu de :
cy.clearIndexedDB()
cy.visit('/data-providers')
cy.waitForApp()

// Utilisez :
cy.setupTest('/data-providers')
```

### `cy.mockGarminFetch()`

Intercepte les requêtes fetch vers l'API Garmin et retourne les données de la fixture.

```javascript
beforeEach(() => {
  cy.mockGarminFetch()
})
```

## Écrire de nouveaux tests

### Structure d'un test

```javascript
describe('Nom de la suite de tests', () => {
  beforeEach(() => {
    // Configuration avant chaque test
    cy.setupTest('/page-initiale')
  })

  it('devrait faire quelque chose', () => {
    // 1. Arrange : Préparer l'état
    cy.getByTestId('mon-element').should('be.visible')

    // 2. Act : Effectuer une action
    cy.getByTestId('mon-bouton').click()

    // 3. Assert : Vérifier le résultat
    cy.getByTestId('resultat').should('contain', 'Succès')
  })
})
```

### Ajouter des attributs data-test

**IMPORTANT :** Pour rendre les tests robustes et indépendants de la langue, ajoutez toujours des attributs `data-test` aux éléments que vous voulez tester.

```vue
<template>
  <!-- ❌ Mauvais : dépend du texte traduit -->
  <button>{{ t('common.save') }}</button>

  <!-- ✅ Bon : attribut data-test -->
  <button data-test="save-button">{{ t('common.save') }}</button>

  <!-- ✅ Bon : attribut data-test dynamique -->
  <div
    v-for="item in items"
    :key="item.id"
    :data-test="`item-${item.id}`"
  >
    {{ item.name }}
  </div>
</template>
```

### Créer une fixture

Les fixtures contiennent des données de test réutilisables.

1. Créez un fichier JSON dans `tests/e2e/fixtures/`
2. Chargez-le dans votre test :

```javascript
beforeEach(() => {
  cy.fixture('ma-fixture').as('mesData')
})

it('devrait utiliser les données de la fixture', () => {
  cy.get('@mesData').then((data) => {
    // Utilisez les données
    expect(data).to.have.property('id')
  })
})
```

## Bonnes pratiques

### 1. Utilisez des sélecteurs data-test

✅ **Bon :**
```javascript
cy.getByTestId('activity-card').should('exist')
```

❌ **Mauvais :**
```javascript
cy.contains('Activity Card').should('exist') // Dépend de la traduction
cy.get('.activity-card').should('exist')      // Dépend du CSS
```

### 2. Attendez les éléments avec des timeouts appropriés

```javascript
// Pour les éléments qui peuvent mettre du temps à apparaître
cy.getByTestId('activity-card', { timeout: 8000 }).should('exist')
```

### 3. Nettoyez l'état entre les tests

```javascript
beforeEach(() => {
  cy.setupTest('/') // Nettoie IndexedDB automatiquement
})
```

### 4. Interceptez les requêtes réseau

```javascript
beforeEach(() => {
  cy.intercept('POST', '**/api/activities', { statusCode: 200 }).as('createActivity')
})

it('devrait créer une activité', () => {
  cy.getByTestId('create-button').click()
  cy.wait('@createActivity')
  cy.getByTestId('success-message').should('be.visible')
})
```

### 5. Utilisez des alias pour les fixtures

```javascript
beforeEach(() => {
  cy.fixture('garmin_activity').as('garminData')
})

it('devrait utiliser la fixture', () => {
  cy.get('@garminData').then((data) => {
    // Utilisez data
  })
})
```

## Résolution de problèmes

### Le test échoue avec "Timed out retrying after 4000ms"

**Cause :** L'élément n'est pas trouvé dans le délai imparti.

**Solutions :**
1. Vérifiez que le serveur de dev est bien démarré (`npm run dev`)
2. Augmentez le timeout : `cy.getByTestId('element', { timeout: 10000 })`
3. Vérifiez que l'attribut `data-test` existe bien dans le composant
4. Utilisez `cy.waitForApp()` après `cy.visit()`

### IndexedDB n'est pas nettoyée entre les tests

**Solution :** Utilisez `cy.setupTest()` ou `cy.clearIndexedDB()` dans `beforeEach()`.

### Le test fonctionne localement mais échoue en CI

**Causes possibles :**
1. Les timeouts sont trop courts pour un environnement CI plus lent
2. Le serveur de dev n'est pas démarré en CI
3. Les fixtures ne sont pas commises dans Git

**Solutions :**
1. Augmentez les timeouts pour les éléments critiques
2. Vérifiez la configuration CI (GitHub Actions, etc.)
3. Vérifiez que les fixtures sont dans le dépôt Git

### Le test intercepte mal les requêtes fetch

**Solution :** Utilisez `cy.intercept()` plutôt que de stubber `window.fetch` directement :

```javascript
// ✅ Bon
cy.intercept('GET', '**/activities/fetch', { fixture: 'garmin_activity' }).as('fetchActivities')

// ❌ Mauvais (peut causer des problèmes)
cy.on('window:before:load', (win) => {
  win.fetch = () => { /* ... */ }
})
```

### Debug : voir ce qui se passe

En mode interactif (`npx cypress open`), vous pouvez :
- Cliquer sur chaque étape du test dans le panneau de gauche
- Voir l'état de l'app à ce moment-là
- Ouvrir les DevTools du navigateur (F12)
- Utiliser `cy.debug()` ou `cy.pause()` dans votre test

```javascript
it('devrait faire quelque chose', () => {
  cy.getByTestId('element')
  cy.pause() // Le test s'arrête ici, vous pouvez inspecter manuellement
  cy.getByTestId('element').click()
})
```

## Ressources

- [Documentation officielle Cypress](https://docs.cypress.io/)
- [Best Practices Cypress](https://docs.cypress.io/guides/references/best-practices)
- [Sélecteurs Cypress](https://docs.cypress.io/guides/core-concepts/introduction-to-cypress#Querying-Elements)
- [Testing Best Practices OpenStride](./TESTING_BEST_PRACTICES.md)
