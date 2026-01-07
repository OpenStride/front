# OpenStride – Front-end

Application Vue 3 / TypeScript orientée confidentialité (local‑first) pour visualiser, analyser et conserver ses activités sportives (course, trail, vélo…) via un système de plugins (providers de données, stockage, extensions UI) + futur assistant d’analyse (projet ChatGPT OpenStride).

---

## Table des matières
1. Vision Produit (État Actuel v0.1)
2. Proposition de Valeur & Personas
3. Principes & Indicateurs
4. Assistant / Projet ChatGPT
5. Architecture & Structure
6. Modèle de Données
7. Analyse & Visualisations
8. Système de Plugins
9. Flux Données (simplifié)
10. Stockage & Synchronisation
11. Sécurité & Vie Privée
12. Roadmap (suggestion)
13. Tests & Qualité
14. Contribution & Conventions
15. Ajouter un Plugin (How‑To)
16. Glossaire
17. Fichiers / Services Clés
18. Scripts NPM
19. Pistes d'Amélioration
20. Documentation Technique
21. Licence

---

## 1. Vision Produit
Rendre chaque sportif souverain sur ses données d'entraînement : collecte, analyse, conservation et enrichissement sans dépendre d'une plateforme fermée.
Trépied : Local‑first / Extensible / Respect vie privée.

### État Actuel : v0.1 (POC)
- ✅ Architecture local-first fonctionnelle (IndexedDB)
- ✅ Plugin Garmin opérationnel (OAuth + import activités)
- ✅ Plugin ZipImport (fichiers FIT/GPX)
- ✅ Plugin Google Drive (backup opt-in avec PKCE)
- ✅ Widgets essentiels (graphiques vitesse, FC, cadence, altitude)
- ✅ Système d'agrégation (meilleurs temps, statistiques)
- ⚠️ CorosProvider incomplet (stub à finaliser)
- 📊 Couverture tests: ~15-20% (objectif 70%+)

### Problèmes adressés
- Fragmentation (Garmin, Coros, fichiers FIT/GPX dispersés).
- Opaqueness des calculs (segments, VO2 estimée…).
- Difficulté d'export & pérennisation (vendor lock‑in).
- Exploitation opaque des données personnelles.

---

## 2. Proposition de Valeur & Personas

| Axe | Valeur |
|-----|--------|
| Souveraineté | Données stockées localement (IndexedDB) + export simple. |
| Transparence | Code & algorithmes ouverts (`ActivityAnalyzer`). |
| Extensibilité | Plugins auto‑découverts (data, storage, UI). |
| Pérennité | Sauvegardes optionnelles (ex: Google Drive). |
| Personnalisation | Tableau d’activité modulable par widgets. |

Personas:
- Coureur amateur data‑curious (splits & best distances).
- Traileur / cycliste (altitude, pente, segmentation).
- Développeur open‑source (ajoute un provider / widget).
- Utilisateur privacy‑first (contrôle total, pas de cloud forcé).

---

## 3. Principes & Indicateurs

Principes:
1. Local-first (fonctionne hors‑ligne).
2. Opt‑in explicite pour toute synchronisation distante.
3. API plugin simple → stabilité avant 1.0.
4. Performance (rendu vue activité < 1.5s cible).
5. Progressive enhancement (plugins non critiques non bloquants).

Indicateurs (ex):
- % activités analysées sans erreur.
- Temps première visualisation après import.
- Nb moyen de plugins actifs / utilisateur.
- Taux de succès sync (local ↔ stockage).

---

## 4. Assistant / Projet ChatGPT
But: Exploitation conversationnelle locale des métriques (pacing, variabilité FC, fatigue estimée) sans fuite de données brutes.

Phases proposées:
1. Q/R statiques sur données dérivées (résumés).
2. Génération de synthèses post‑séance (client only).
3. Agrégation multi‑séances (tendances).
4. Coach AI (conseils contextuels) – plugin désactivable.

Lien: https://chatgpt.com/g/g-p-67d572f93a0481919a72209e081cc282-open-stride/project

Principes assistant:
- Pas d’envoi de samples bruts par défaut.
- Anonymisation / réduction (features dérivées).
- Opt‑in explicite.

---

## 5. Architecture & Structure

```
index.html
public/                # Manifest PWA, icônes
src/
  main.ts              # Bootstrap Vue
  router/              # Routes & guards
  components/          # Composants UI génériques
  views/               # Pages (Home, ActivityDetails…)
  services/            # Logique (analyse, storage, plugins, sync)
  composables/         # Hooks (useSlotExtensions…)
  utils/               # Helpers (format, math…)
  types/               # Types TS (activity, provider, storage…)
  assets/              # Styles, images
plugins/
  app-extensions/      # Widgets / blocs UI
  data-providers/      # Connecteurs sources
  storage-providers/   # Sauvegardes
tests/
  unit/                # Vitest
```

Alias: `@ -> src`, `@plugins -> plugins` (cf. `AGENTS.md`).

---

## 6. Modèle de Données

Types (`src/types/activity.ts`):
- Activity: id, date, distance, type, providerId.
- Sample: timeOffset, speed, heartRate, cadence, elevation…
- ActivityDetails: samples + laps + stats dérivées.

---

## 7. Analyse & Visualisations

Service: `ActivityAnalyzer`  
Fonctions:
- `sampleAverageByDistance`
- Laps & regroupements
- Best segments (multi distances)
- Découpage pente
- Stats agrégées (min/max/avg)

Widgets:
- Résumé
- Vitesse segmentée
- Allure / km + altitude
- Cadence
- Fréquence cardiaque & zones
- Best segments (distances cibles)

---

## 8. Système de Plugins

Auto‑découverte (`import.meta.glob`):
- Data: `ProviderPluginRegistry`
- Storage: `StoragePluginRegistry`
- UI: `ExtensionPluginRegistry`

Interfaces: `ProviderPlugin`, `StoragePlugin`, `ExtensionPlugin`.
Slots UI:
- `activity.top`
- `activity.widgets`

Activation persistée: `DataProviderPluginManager`, `StoragePluginManager`.
Injection UI: `useSlotExtensions` + `ActivityDetails.vue`.

### Plugins Disponibles

**Data Providers (Sources de données):**
- ✅ **GarminProvider** : Import OAuth depuis Garmin Connect (actif)
- ✅ **ZipImportProvider** : Import fichiers FIT/GPX locaux (actif)
- ⚠️ **CorosProvider** : Stub incomplet (à finaliser ou supprimer)

**Storage Providers (Sauvegarde):**
- ✅ **GDrive** : Backup Google Drive avec OAuth PKCE (actif)

**App Extensions (Widgets UI):**
- ✅ **StandardDetails** : Bloc résumé + graphiques vitesse, cadence, FC, altitude
- ✅ **AggregatedDetails** : Best segments (distances cibles)
- ✅ **AggregatedProgress** : Statistiques et progression

---

## 9. Flux Données (simplifié)

1. Provider → adaptation interne.
2. Stockage local (IndexedDB).
3. Analyse à la demande.
4. Rendu widgets.
5. Sync optionnelle (plugins storage).
6. (Futur) Génération features assistant.

---

## 10. Stockage & Synchronisation

Local: `IndexedDBService` (stores: settings, activities, activity_details, notifLogs).  
Distants: orchestrés par `StorageService`.  
Google Drive: auth PKCE + lecture/écriture JSON (`GoogleDriveFileService`, `GoogleDriveSync`).  
Fusion: logique simple horodatage (améliorations prévues).

---

## 11. Sécurité & Vie Privée

- **Variables exposées**: `VITE_*` seulement (Vite build-time injection)
- **Secrets**: Jamais de secrets hardcodés ou commités dans Git
- **OAuth Google Drive**:
  - Utilise PKCE (Proof Key for Code Exchange) + client_secret
  - Client type "Web application" (requis par Google pour apps browser)
  - client_secret exposé côté client (compromis serverless)
  - Protection: redirect URIs restreintes sur Google Cloud Console
  - Secret stocké dans `.env` (`.gitignore`, non committé, rotatable)
  - Note: Google ne supporte pas PKCE pur (sans secret) pour apps browser
- **Sync opt-in**: Aucune synchronisation forcée vers le cloud
- **Prévisions**:
  - Chiffrement local des données sensibles
  - Masquage GPS départ/arrivée (privacy zones)
  - Assistant: données dérivées/anonymisées uniquement

---

## 12. Roadmap (suggestion)

| Phase | Contenu | Objectif |
|-------|---------|----------|
| 0.1 | Base local-first, Garmin, GDrive, widgets essentiels | POC |
| 0.2 | Import FIT/GPX, Coros provider, export bundle | Sources |
| 0.3 | Assistant local (résumés), offline robuste | Insight |
| 0.4 | Partage chiffré / multi-profils | Collaboration |
| 0.5 | Catalogue plugins UI + thème sombre | Personnalisation |
| 0.6 | Coach AI, anomalies capteurs | Valeur avancée |
| 1.0 | API plugin stable + docs + perf/tests | Release |

---

## 13. Tests & Qualité

- **Framework**: Vitest + Vue Test Utils (`happy-dom`)
- **E2E**: Cypress configuré (`npm run test:e2e`)
- **Couverture actuelle**: ~15-20% (services clés: ActivityAnalyzer, StorageService)
- **Objectif 1.0**: Services > 70%, composants critiques > 60%
- **Benchmarks**: Tests de performance pour ActivityAnalyzer (5k+ samples)

Tests prioritaires:
- ActivityAnalyzer: segmentation, best efforts, slope analysis
- StorageService: merge logic, conflict resolution
- Plugin discovery & activation
- UI widgets avec données dynamiques

---

## 14. Contribution & Conventions

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).  
PR: résumé, issues liées, screenshots UI, steps test, risque & rollback.  
CI attendu: build, lint, tests OK.

---

## 15. Ajouter un Plugin

Data Provider:
```ts
export default {
  id: 'garmin',
  label: 'Garmin',
  setupComponent: () => import('./Setup.vue')
}
```

Storage Provider:
```ts
export default {
  id: 'gdrive',
  label: 'Google Drive',
  async readRemote(ctx) { /* ... */ },
  async writeRemote(ctx, payload) { /* ... */ }
}
```

App Extension:
```ts
export default {
  id: 'standard-details',
  slots: {
    'activity.top': [ () => import('./ActivityTopBlock.vue') ],
    'activity.widgets': [
      () => import('./SpeedSampled.vue'),
      () => import('./CadenceGraph.vue')
    ]
  }
}
```

Structure: `plugins/<cat>/<id>/client/index.ts` ou `plugins/app-extensions/<id>/index.ts`.  
Aucun registre manuel.

---

## 16. Glossaire

- Activity: séance sportive.
- Sample: point temporel + métriques.
- Best Segment: intervalle optimal allure/vitesse.
- Provider: source ingestion.
- Storage Plugin: destination sauvegarde.
- Extension / Slot: injection UI dynamique.
- Local-first: logique prioritaire locale.

---

## 17. Fichiers / Services Clés

| Domaine | Fichier |
|---------|---------|
| Bootstrap | `src/main.ts` |
| Routing | `src/router/index.ts` |
| Analyse | `src/services/ActivityAnalyzer.ts` |
| IndexedDB | `src/services/IndexedDBService.ts` |
| Sync | `src/services/StorageService.ts` |
| Scan plugins | `src/services/*PluginRegistry.ts` |
| Vue activité | `src/views/ActivityDetails.vue` |
| Composable slots | `src/composables/useSlotExtensions.ts` |
| Google Drive | `plugins/storage-providers/GDrive/client/` |
| Widgets standard | `plugins/app-extensions/StandardDetails/` |
| Best segments | `plugins/app-extensions/AggregatedDetails/` |

---

## 18. Scripts NPM

```
npm run dev        # http://localhost:3000
npm run build      # Build production (dist/)
npm run preview    # http://localhost:4173
npm run lint       # ESLint
npm run test:unit  # Vitest
```

---

## 19. Pistes d’Amélioration

- Fusion avancée (CRDT / vecteurs).
- Chiffrement end‑to‑end.
- Masquage départ GPS.
- Web Worker pour analyses lourdes.
- Catalogue activation/désactivation plugins UI.
- Import batch drag & drop.
- Tests charge (5k+ activités).
- Internationalisation (i18n).

---

## 20. Documentation Technique

Documentation détaillée disponible dans le dossier `docs/`:

| Fichier | Description |
|---------|-------------|
| **CLAUDE.md** | Guide complet pour travailler avec Claude Code sur ce projet (architecture, commandes, plugins) |
| **ROADMAP_TECHNIQUE.md** | Feuille de route technique détaillée (12 semaines) : sécurité, qualité, tests, performance |
| **ANALYSE_COMPLETE.md** | Analyse approfondie du code : qualité, architecture, problèmes identifiés, recommandations |
| **TEST_GOOGLE_OAUTH.md** | Guide de test pour l'implémentation OAuth Google Drive avec PKCE |
| **GOOGLE_OAUTH_DESKTOP_SETUP.md** | Documentation sur la configuration OAuth (Desktop vs Web app) |
| **MIGRATION_DESKTOP_APP.md** | Tentative de migration vers Desktop app OAuth (non viable) |
| **ROLLBACK_TO_CLIENT_SECRET.md** | Justification du retour à client_secret (architecture serverless) |
| **garmin_callbacks_traces.md** | Traces de callbacks Garmin pour debug/référence |

**Pour les développeurs Claude Code**: Lire `docs/CLAUDE.md` en priorité.

---

## 21. Licence

À définir (MIT / Apache‑2.0). Ajouter `LICENSE`.

---

Sections à détailler ultérieurement: métriques précises, spec assistant, diagrammes séquence sync & lifecycle.