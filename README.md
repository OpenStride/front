# OpenStride – Front-end

Privacy-focused Vue 3 / TypeScript application (local-first) for visualizing, analyzing and preserving sports activities (running, trail running, cycling...) via a plugin system (data providers, storage, UI extensions) + future AI assistant (ChatGPT OpenStride project).

---

## Table of Contents
1. Product Vision (Current State v0.1)
2. Value Proposition & Personas
3. Principles & Indicators
4. AI Assistant / ChatGPT Project
5. Architecture & Structure
6. Data Model
7. Analysis & Visualizations
8. Plugin System
9. Data Flow (simplified)
10. Storage & Synchronization
11. Security & Privacy
12. Roadmap (suggestion)
13. Tests & Quality
14. Contribution & Conventions
15. Adding a Plugin (How-To)
16. Glossary
17. Key Files / Services
18. NPM Scripts
19. Improvement Ideas
20. Technical Documentation
21. License

---

## 1. Product Vision
Make every athlete sovereign over their training data: collection, analysis, preservation and enrichment without depending on a closed platform.
Three pillars: Local-first / Extensible / Privacy-focused.

### Current State: v0.1 (POC)
- ✅ Functional local-first architecture (IndexedDB)
- ✅ Garmin plugin operational (OAuth + activity import)
- ✅ ZipImport plugin (FIT/GPX files)
- ✅ Google Drive plugin (opt-in backup with PKCE)
- ✅ Essential widgets (speed, HR, cadence, elevation charts)
- ✅ Aggregation system (best times, statistics)
- ⚠️ CorosProvider incomplete (stub to finalize or remove)
- 📊 Test coverage: ~15-20% (target 70%+)

### Problems Addressed
- Fragmentation (Garmin, Coros, scattered FIT/GPX files).
- Opaque calculations (segments, estimated VO2...).
- Export & preservation difficulty (vendor lock-in).
- Opaque exploitation of personal data.

---

## 2. Value Proposition & Personas

| Axis | Value |
|------|-------|
| Sovereignty | Data stored locally (IndexedDB) + simple export. |
| Transparency | Open code & algorithms (`ActivityAnalyzer`). |
| Extensibility | Auto-discovered plugins (data, storage, UI). |
| Sustainability | Optional backups (e.g., Google Drive). |
| Customization | Modular activity dashboard with widgets. |

Personas:
- Data-curious amateur runner (splits & best distances).
- Trail runner / cyclist (altitude, slope, segmentation).
- Open-source developer (adds provider / widget).
- Privacy-first user (total control, no forced cloud).

---

## 3. Principles & Indicators

Principles:
1. Local-first (works offline).
2. Explicit opt-in for any remote synchronization.
3. Simple plugin API → stability before 1.0.
4. Performance (activity view render < 1.5s target).
5. Progressive enhancement (non-critical plugins are non-blocking).

Indicators (examples):
- % activities analyzed without errors.
- Time to first visualization after import.
- Average number of active plugins / user.
- Sync success rate (local ↔ storage).

---

## 4. AI Assistant / ChatGPT Project
Goal: Local conversational exploitation of metrics (pacing, HR variability, estimated fatigue) without raw data leakage.

Proposed phases:
1. Static Q&A on derived data (summaries).
2. Post-session synthesis generation (client only).
3. Multi-session aggregation (trends).
4. AI Coach (contextual advice) – disableable plugin.

Link: https://chatgpt.com/g/g-p-67d572f93a0481919a72209e081cc282-open-stride/project

Assistant principles:
- No raw sample sending by default.
- Anonymization / reduction (derived features).
- Explicit opt-in.

---

## 5. Architecture & Structure

```
index.html
public/                # PWA manifest, icons
src/
  main.ts              # Vue bootstrap
  router/              # Routes & guards
  components/          # Generic UI components
  views/               # Pages (Home, ActivityDetails...)
  services/            # Logic (analysis, storage, plugins, sync)
  composables/         # Hooks (useSlotExtensions...)
  utils/               # Helpers (format, math...)
  types/               # TS types (activity, provider, storage...)
  assets/              # Styles, images
plugins/
  app-extensions/      # Widgets / UI blocks
  data-providers/      # Source connectors
  storage-providers/   # Backups
tests/
  unit/                # Vitest
```

Aliases: `@ -> src`, `@plugins -> plugins` (see `AGENTS.md`).

---

## 6. Data Model

Types (`src/types/activity.ts`):
- Activity: id, date, distance, type, providerId.
- Sample: timeOffset, speed, heartRate, cadence, elevation...
- ActivityDetails: samples + laps + derived stats.

---

## 7. Analysis & Visualizations

Service: `ActivityAnalyzer`
Functions:
- `sampleAverageByDistance`
- Laps & grouping
- Best segments (multiple distances)
- Slope breakdown
- Aggregated stats (min/max/avg)

Widgets:
- Summary
- Segmented speed
- Pace / km + altitude
- Cadence
- Heart rate & zones
- Best segments (target distances)

---

## 8. Plugin System

Auto-discovery (`import.meta.glob`):
- Data: `ProviderPluginRegistry`
- Storage: `StoragePluginRegistry`
- UI: `ExtensionPluginRegistry`

Interfaces: `ProviderPlugin`, `StoragePlugin`, `ExtensionPlugin`.
UI Slots:
- `activity.top`
- `activity.widgets`

Persisted activation: `DataProviderPluginManager`, `StoragePluginManager`.
UI injection: `useSlotExtensions` + `ActivityDetails.vue`.

### Available Plugins

**Data Providers (Data sources):**
- ✅ **GarminProvider**: OAuth import from Garmin Connect (active)
- ✅ **ZipImportProvider**: Import local FIT/GPX files (active)
- ⚠️ **CorosProvider**: Incomplete stub (to finalize or remove)

**Storage Providers (Backup):**
- ✅ **GDrive**: Google Drive backup with OAuth PKCE (active)

**App Extensions (UI Widgets):**
- ✅ **StandardDetails**: Summary block + speed, cadence, HR, altitude charts
- ✅ **AggregatedDetails**: Best segments (target distances)
- ✅ **AggregatedProgress**: Statistics and progression

---

## 9. Data Flow (simplified)

1. Provider → internal adaptation.
2. Local storage (IndexedDB).
3. On-demand analysis.
4. Widget rendering.
5. Optional sync (storage plugins).
6. (Future) Assistant feature generation.

---

## 10. Storage & Synchronization

Local: `IndexedDBService` (stores: settings, activities, activity_details, notifLogs).
Remote: orchestrated by `StorageService`.
Google Drive: PKCE auth + JSON read/write (`GoogleDriveFileService`, `GoogleDriveSync`).
Merge: simple timestamp logic (improvements planned).

---

## 11. Security & Privacy

- **Exposed variables**: `VITE_*` only (Vite build-time injection)
- **Secrets**: Never hardcoded secrets or committed in Git
- **Google Drive OAuth**:
  - Uses PKCE (Proof Key for Code Exchange) + client_secret
  - Client type "Web application" (required by Google for browser apps)
  - client_secret exposed client-side (serverless compromise)
  - Protection: restricted redirect URIs on Google Cloud Console
  - Secret stored in `.env` (`.gitignore`, not committed, rotatable)
  - Note: Google does not support pure PKCE (without secret) for browser apps
- **Opt-in sync**: No forced cloud synchronization
- **Planned features**:
  - Local encryption of sensitive data
  - GPS start/finish masking (privacy zones)
  - Assistant: derived/anonymized data only

---

## 12. Roadmap (suggestion)

| Phase | Content | Goal |
|-------|---------|------|
| 0.1 | Local-first base, Garmin, GDrive, essential widgets | POC |
| 0.2 | FIT/GPX import, Coros provider, bundle export | Sources |
| 0.3 | Local assistant (summaries), robust offline | Insight |
| 0.4 | Encrypted sharing / multi-profiles | Collaboration |
| 0.5 | Plugin catalog UI + dark theme | Personalization |
| 0.6 | AI Coach, sensor anomalies | Advanced value |
| 1.0 | Stable plugin API + docs + perf/tests | Release |

---

## 13. Tests & Quality

- **Framework**: Vitest + Vue Test Utils (`happy-dom`)
- **E2E**: Cypress configured (`npm run test:e2e`)
- **Current coverage**: ~15-20% (key services: ActivityAnalyzer, StorageService)
- **1.0 Target**: Services > 70%, critical components > 60%
- **Benchmarks**: Performance tests for ActivityAnalyzer (5k+ samples)

Priority tests:
- ActivityAnalyzer: segmentation, best efforts, slope analysis
- StorageService: merge logic, conflict resolution
- Plugin discovery & activation
- UI widgets with dynamic data

---

## 14. Contribution & Conventions

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
PR: summary, linked issues, UI screenshots, test steps, risk & rollback.
Expected CI: build, lint, tests OK.

---

## 15. Adding a Plugin

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

Structure: `plugins/<cat>/<id>/client/index.ts` or `plugins/app-extensions/<id>/index.ts`.
No manual registry.

---

## 16. Glossary

- Activity: sports session.
- Sample: time point + metrics.
- Best Segment: optimal pace/speed interval.
- Provider: ingestion source.
- Storage Plugin: backup destination.
- Extension / Slot: dynamic UI injection.
- Local-first: local-priority logic.

---

## 17. Key Files / Services

| Domain | File |
|--------|------|
| Bootstrap | `src/main.ts` |
| Routing | `src/router/index.ts` |
| Analysis | `src/services/ActivityAnalyzer.ts` |
| IndexedDB | `src/services/IndexedDBService.ts` |
| Sync | `src/services/StorageService.ts` |
| Plugin scan | `src/services/*PluginRegistry.ts` |
| Activity view | `src/views/ActivityDetails.vue` |
| Slots composable | `src/composables/useSlotExtensions.ts` |
| Google Drive | `plugins/storage-providers/GDrive/client/` |
| Standard widgets | `plugins/app-extensions/StandardDetails/` |
| Best segments | `plugins/app-extensions/AggregatedDetails/` |

---

## 18. NPM Scripts

```
npm run dev        # http://localhost:3000
npm run build      # Production build (dist/)
npm run preview    # http://localhost:4173
npm run lint       # ESLint
npm run test:unit  # Vitest
```

---

## 19. Improvement Ideas

- Advanced merge (CRDT / vectors).
- End-to-end encryption.
- GPS start masking.
- Web Worker for heavy analysis.
- Plugin activation/deactivation catalog UI.
- Batch import drag & drop.
- Load testing (5k+ activities).
- Internationalization (i18n).

---

## 20. Technical Documentation

Detailed documentation available in the `docs/` folder:

| File | Description |
|------|-------------|
| **CLAUDE.md** | Complete guide for working with Claude Code on this project (architecture, commands, plugins) |
| **ROADMAP_TECHNIQUE.md** | Detailed technical roadmap (12 weeks): security, quality, tests, performance |
| **ANALYSE_COMPLETE.md** | In-depth code analysis: quality, architecture, identified issues, recommendations |
| **TEST_GOOGLE_OAUTH.md** | Test guide for Google Drive OAuth implementation with PKCE |
| **GOOGLE_OAUTH_DESKTOP_SETUP.md** | Documentation on OAuth configuration (Desktop vs Web app) |
| **MIGRATION_DESKTOP_APP.md** | Desktop app OAuth migration attempt (not viable) |
| **ROLLBACK_TO_CLIENT_SECRET.md** | Justification for client_secret rollback (serverless architecture) |
| **garmin_callbacks_traces.md** | Garmin callback traces for debug/reference |

**For Claude Code developers**: Read `docs/CLAUDE.md` first.

---

## 21. License

To be defined (MIT / Apache-2.0). Add `LICENSE`.

---

Future sections: precise metrics, assistant spec, sync & lifecycle sequence diagrams.
