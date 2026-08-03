# Roadmap Technique OpenStride

**Date:** 2026-01-02
**Basé sur:** Analyse approfondie du codebase (agent ac8daae)

## 🎯 Objectif

Passer de POC (v0.1) à production-ready (v1.0) en adressant les problèmes critiques de sécurité, qualité, et UX.

---

## 📊 État Actuel

- **Version:** 0.1 (POC)
- **Couverture tests:** ~15-20%
- **Dette technique:** Élevée (sécurité, types, validation)
- **Prêt pour production:** ❌ Non (problèmes critiques)

---

## Phase 1 : SÉCURITÉ & STABILITÉ (2-3 semaines) 🔴 URGENT

**Objectif:** Corriger les failles de sécurité critiques et stabiliser l'application

### 1.1 Sécurité Google Drive (Priorité MAX)

**Problème:** CLIENT_SECRET exposé en clair dans le code source

**Actions:**

- [ ] Créer backend proxy minimal (Node.js/Express ou Cloud Function)
  - Endpoint `/api/google/token` pour échanger code contre token
  - Endpoint `/api/google/refresh` pour refresh token
  - CLIENT_SECRET stocké en variable d'environnement backend
- [ ] Modifier `GoogleDriveAuthService.ts`:
  - Supprimer CLIENT_SECRET du frontend
  - Appeler backend proxy au lieu de Google directement
- [ ] Déplacer tokens de localStorage vers:
  - Option A: sessionStorage (meilleur que localStorage)
  - Option B: httpOnly cookies (optimal - nécessite backend)
- [ ] **Régénérer les credentials Google** (actuels compromis)

**Fichiers:**

- `plugins/storage-providers/GDrive/client/GoogleDriveAuthService.ts`
- `plugins/storage-providers/GDrive/client/GoogleDriveSync.ts`
- Nouveau: `backend/auth-proxy/` (à créer)

**Estimation:** 3 jours

---

### 1.2 Validation des Entrées (Priorité HAUTE)

**Problème:** Aucune validation des données externes (Garmin, Strava, imports)

**Actions:**

- [ ] Créer module de validation `src/utils/validators.ts`:
  ```typescript
  export function validateActivity(obj: any): Activity | null
  export function validateSample(obj: any): Sample | null
  export function validateActivityDetails(obj: any): ActivityDetails | null
  ```
- [ ] Implémenter dans adapters:
  - `GarminProvider/client/adapter.ts`
  - `StravaProvider/client/adapter.ts`
  - `ZipImportProvider/client/adapter.ts`
- [ ] Ajouter error reporting si validation échoue
- [ ] Tests unitaires pour chaque validateur

**Fichiers:**

- Nouveau: `src/utils/validators.ts`
- `plugins/data-providers/*/client/adapter.ts`

**Estimation:** 3 jours

---

### 1.3 Gestion d'Erreurs Complète (Priorité HAUTE)

**Problème:** Erreurs silencieuses (catch blocks vides), pas de feedback utilisateur

**Actions:**

- [ ] Supprimer tous les `catch { /* ignore */ }`
- [ ] Remplacer par:
  ```typescript
  catch (error) {
    logger.error('Context', error);
    ToastService.push('Message utilisateur clair', {
      type: 'error',
      action: { label: 'Réessayer', onClick: retryFn }
    });
  }
  ```
- [ ] Créer `src/utils/logger.ts` avec niveaux (error, warn, info, debug)
- [ ] En production: envoyer erreurs vers monitoring (Sentry/LogRocket)
- [ ] Ajouter états d'erreur dans tous les composants Vue

**Fichiers:**

- `src/services/*.ts` (tous les services)
- `src/components/*.vue`
- `src/views/*.vue`
- Nouveau: `src/utils/logger.ts`

**Estimation:** 3 jours

---

### 1.4 Type Safety TypeScript (Priorité MOYENNE)

**Problème:** 95+ occurrences de `any`, perte totale de type-safety

**Actions:**

- [ ] Définir interfaces strictes dans `src/types/`:

  ```typescript
  interface KeyedItem {
    key?: string
    id?: string
    activityId?: string
  }

  interface SyncDetail {
    store: string
    key: string
  }

  interface PluginModule<T> {
    default: T
  }
  ```

- [ ] Remplacer `any` par types stricts dans:
  - `StorageService.ts` (priorité max - 95 occurrences)
  - `AggregationService.ts`
  - `main.ts`
  - Vue components (`activities: ref<Activity[]>` au lieu de `any[]`)
- [ ] Activer `strict: true` dans `tsconfig.json`
- [ ] Fixer erreurs de compilation

**Fichiers:**

- `src/types/*.ts`
- `src/services/*.ts`
- `tsconfig.json`

**Estimation:** 4 jours

---

## Phase 2 : QUALITÉ & TESTS (3-4 semaines) 🟡

**Objectif:** Atteindre 70%+ couverture tests et améliorer robustesse

### 2.1 Tests Services Critiques (Priorité HAUTE)

**Problème:** IndexedDBService, StorageService, AggregationService non testés

**Actions:**

- [ ] `IndexedDBService.spec.ts`:
  - Migrations de version
  - Événements dbChange
  - Gestion erreurs quota
  - Transactions
- [ ] `StorageService.spec.ts`:
  - Merge logic bidirectionnel
  - Hash comparison
  - Gestion erreurs plugins
  - Manifest updates
- [ ] `AggregationService.spec.ts`:
  - Calculs périodes (semaines ISO)
  - Agrégation métriques
  - Notifications subscribers
- [ ] `GoogleDriveAuthService.spec.ts`:
  - PKCE flow
  - Token refresh
  - Error handling
- [ ] `GoogleDriveSync.spec.ts`:
  - Sync bidirectionnel
  - Manifest optimization

**Estimation:** 5 jours

---

### 2.2 Tests E2E Critiques (Priorité MOYENNE)

**Problème:** Cypress configuré mais 0 tests

**Actions:**

- [ ] Créer tests E2E essentiels:
  - `tests/e2e/specs/garmin-import.cy.js` (améliorer existant)
  - `tests/e2e/specs/activity-details.cy.js`
  - `tests/e2e/specs/gdrive-sync.cy.js`
  - `tests/e2e/specs/aggregation.cy.js`
- [ ] Mock backends (Garmin API, Google Drive API)
- [ ] Fixtures complètes d'activités
- [ ] CI/CD: run E2E avant déploiement

**Estimation:** 4 jours

---

### 2.3 Refactoring Code Dupliqué (Priorité BASSE)

**Problème:** Fonctions répétées (keyFn, hash, cleanup)

**Actions:**

- [ ] Créer `src/utils/sync.ts`:
  ```typescript
  export function extractKey(item: KeyedItem): string
  export function computeContentHash(data: any): Promise<string>
  export function stripLastModified(obj: any): any
  ```
- [ ] Utiliser dans `StorageService`, `GoogleDriveSync`, etc.

**Estimation:** 1 jour

---

## Phase 3 : PERFORMANCE (2-3 semaines) 🟢

**Objectif:** Améliorer réactivité pour datasets larges (1000+ activités)

### 3.1 Web Workers pour Calculs Lourds (Priorité HAUTE)

**Problème:** `ActivityAnalyzer.bestSegments()` bloque thread principal (O(n²))

**Actions:**

- [ ] Créer `src/workers/activity-analyzer.worker.ts`:
  - Déplacer `bestSegments()` et `sampleBySlopeChange()`
  - Communication via `postMessage`
- [ ] Adapter `ActivityDetails.vue`:
  ```typescript
  const worker = new Worker(new URL('@/workers/activity-analyzer.worker.ts', import.meta.url))
  worker.postMessage({ samples, targets })
  worker.onmessage = e => {
    bestSegments.value = e.data
  }
  ```
- [ ] Fallback si Web Workers non supportés

**Fichiers:**

- Nouveau: `src/workers/activity-analyzer.worker.ts`
- `src/views/ActivityDetails.vue`

**Estimation:** 3 jours

---

### 3.2 Virtualization Infinite Scroll (Priorité MOYENNE)

**Problème:** MyActivities charge 1000+ ActivityCard DOM nodes (mémoire + rendering lent)

**Actions:**

- [ ] Installer `vue-virtual-scroller`
- [ ] Remplacer infinite scroll custom par:
  ```vue
  <RecycleScroller :items="activities" :item-size="120" key-field="id" v-slot="{ item }">
    <ActivityCard :activity="item" />
  </RecycleScroller>
  ```
- [ ] Benchmark avant/après (mémoire + FPS)

**Fichiers:**

- `src/views/MyActivities.vue`

**Estimation:** 2 jours

---

### 3.3 Optimisation Bootstrap (Priorité BASSE)

**Problème:** Aggregation dans `main.ts` déclenche getAllData() à chaque dbChange

**Actions:**

- [ ] Debounce aggregation updates:
  ```typescript
  const debouncedAggregate = debounce(async () => {
    const allActs = await db.getAllData('activities')
    // ...
  }, 1000)
  ```
- [ ] Ou: Batch updates (collecter ids changés, traiter par lots)
- [ ] Créer Map<id, activity> au lieu de find() O(n)

**Fichiers:**

- `src/main.ts`

**Estimation:** 1 jour

---

## Phase 4 : UX & ACCESSIBILITÉ (2-3 semaines) 🟢

**Objectif:** Atteindre WCAG AA compliance et améliorer feedback utilisateur

### 4.1 Gestion États de Chargement/Erreurs (Priorité HAUTE)

**Actions:**

- [ ] Ajouter états `loading`, `error`, `data` dans tous les composants:
  ```vue
  <div v-if="loading">Chargement...</div>
  <div v-else-if="error">
    <p>{{ error.message }}</p>
    <button @click="retry">Réessayer</button>
  </div>
  <div v-else-if="data">{{ data }}</div>
  ```
- [ ] Composants à modifier:
  - `ActivityDetails.vue`
  - `MyActivities.vue`
  - `DataProviders.vue`
  - `StorageProviders.vue`

**Estimation:** 2 jours

---

### 4.2 Accessibilité WCAG A (Priorité HAUTE)

**Actions:**

- [ ] Ajouter aria-labels sur tous les boutons:
  ```vue
  <button aria-label="Actualiser les activités" @click="refresh">
    <svg aria-hidden="true">...</svg>
  </button>
  ```
- [ ] Remplacer `<div role="button">` par vrais `<button>`
- [ ] Ajouter `<label>` sur tous les `<input>` / `<select>`
- [ ] Navigation clavier:
  - `@keydown.enter` sur éléments cliquables
  - `tabindex` correct
- [ ] Tester avec screen reader (NVDA/JAWS)

**Fichiers:**

- `src/components/AppHeader.vue`
- `src/views/*.vue`
- `plugins/*/client/Setup.vue`

**Estimation:** 3 jours

---

### 4.3 Messages Utilisateur Améliorés (Priorité MOYENNE)

**Actions:**

- [ ] Enrichir `ToastService`:
  ```typescript
  interface ToastOptions {
    type: 'success' | 'error' | 'warning' | 'info'
    timeout?: number
    action?: { label: string; onClick: () => void }
    dismissible?: boolean
  }
  ```
- [ ] Utiliser dans tous les catch blocks:
  ```typescript
  ToastService.push('Échec de la synchronisation', {
    type: 'error',
    action: { label: 'Réessayer', onClick: () => syncAgain() }
  })
  ```

**Estimation:** 2 jours

---

## Phase 5 : ARCHITECTURE (2 semaines) 🟢

**Objectif:** Finaliser système de plugins et extensibilité

### 5.1 Extensions App Configurables (Priorité MOYENNE)

**Problème:** Extensions hardcodées au lieu d'être stockées en IndexedDB

**Actions:**

- [ ] Créer `ExtensionPluginManager.ts` similaire aux autres managers:
  ```typescript
  class ExtensionPluginManager {
    async getActivePluginIds(): Promise<string[]> {
      const settings = await db.getDataFromStore('settings', 'activeExtensions')
      return settings?.value || defaultExtensions
    }
    async setActivePluginIds(ids: string[]): Promise<void>
  }
  ```
- [ ] Modifier `ExtensionPluginRegistry.ts`:
  ```typescript
  export async function getActiveAppPlugins(): Promise<ExtensionPlugin[]> {
    const enabledIds = await ExtensionPluginManager.getInstance().getActivePluginIds()
    return allAppPlugins.filter(p => enabledIds.includes(p.id))
  }
  ```
- [ ] Créer UI pour activer/désactiver widgets

**Fichiers:**

- Nouveau: `src/services/ExtensionPluginManager.ts`
- `src/services/ExtensionPluginRegistry.ts`

**Estimation:** 2 jours

---

### 5.2 IndexedDB Schema Amélioré (Priorité BASSE)

**Problème:** Pas de keyPath sur stores critiques, pas d'index, pas de migrations

**Actions:**

- [ ] Ajouter keyPath:
  ```typescript
  { name: "activities", options: { keyPath: "id" } },
  { name: "activity_details", options: { keyPath: "id" } }
  ```
- [ ] Ajouter indexes pour recherches:
  ```typescript
  {
    name: "activities",
    options: { keyPath: "id" },
    indexes: [
      { name: "provider", keyPath: "provider" },
      { name: "startTime", keyPath: "startTime" },
      { name: "type", keyPath: "type" }
    ]
  }
  ```
- [ ] Implémenter migrations:
  ```typescript
  request.onupgradeneeded = event => {
    const oldVersion = event.oldVersion
    if (oldVersion < 8) {
      // Migration 7 -> 8: Add indexes
    }
  }
  ```

**Estimation:** 2 jours

---

## 📅 Timeline Global

```
Semaine 1-2   : Phase 1.1-1.2 (Sécurité Google + Validation)
Semaine 3     : Phase 1.3-1.4 (Erreurs + Types)
Semaine 4-6   : Phase 2.1-2.2 (Tests services + E2E)
Semaine 7-8   : Phase 3.1-3.2 (Web Workers + Virtualization)
Semaine 9-10  : Phase 4.1-4.2 (UX + Accessibilité)
Semaine 11-12 : Phase 5 + Polish (Architecture + finitions)
```

**Total estimé:** 10-12 semaines (~3 mois)

---

## 🎯 Critères de Succès v1.0

- [ ] ✅ Aucune faille de sécurité critique (audit externe)
- [ ] ✅ Couverture tests ≥ 70% (services + composants critiques)
- [ ] ✅ E2E tests couvrant flows principaux
- [ ] ✅ WCAG AA compliant (audit lighthouse ≥ 90/100)
- [ ] ✅ Performance: Time to Interactive < 3s (3G throttled)
- [ ] ✅ Support 5000+ activités sans lag
- [ ] ✅ Zero `any` dans code critique
- [ ] ✅ Documentation API complète
- [ ] ✅ CI/CD avec déploiement automatique
- [ ] ✅ Monitoring erreurs production (Sentry)

---

## 🚀 Actions Immédiates (Cette Semaine)

1. **Créer backend auth proxy** pour Google Drive
2. **Régénérer credentials Google** (actuels compromis)
3. **Implémenter validateurs** pour inputs Garmin/Strava
4. **Remplacer catch vides** par proper error handling
5. **Setup Sentry** pour monitoring production

---

## 📚 Ressources

- **Analyse complète:** Agent ac8daae (voir historique conversation)
- **Documentation:** CLAUDE.md, README
- **Standards:**
  - WCAG 2.1 AA: https://www.w3.org/WAI/WCAG21/quickref/
  - OWASP Top 10: https://owasp.org/www-project-top-ten/
  - TypeScript Strict Mode: https://www.typescriptlang.org/tsconfig#strict

---

**Dernière mise à jour:** 2026-02-06
**Status:** Le refactoring architectural (Phases 1-3 du refactoring data/sync/aggregation) est terminé.
