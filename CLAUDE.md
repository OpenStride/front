# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

OpenStride is a **local-first, privacy-focused Vue 3 / TypeScript PWA** for athletes to visualize and analyze their sports activity data. Data stored in IndexedDB, optional cloud sync via plugins.

**Core Principles:** Local-first, privacy (opt-in sync), plugin-based architecture, open algorithms.

## Development Commands

```bash
npm run dev          # Dev server (localhost:3000)
npm run build        # Production build (dist/)
npm run lint         # ESLint
npm run test:unit    # Vitest
npm run test:e2e     # Cypress
```

## Architecture

### Plugin System (Auto-Discovery via import.meta.glob)

Three types -- all auto-discovered, no manual registration:

| Type             | Path                                          | Interface         |
| ---------------- | --------------------------------------------- | ----------------- |
| Data Provider    | `plugins/data-providers/*/client/index.ts`    | `ProviderPlugin`  |
| Storage Provider | `plugins/storage-providers/*/client/index.ts` | `StoragePlugin`   |
| App Extension    | `plugins/app-extensions/*/index.ts`           | `ExtensionPlugin` |

**Plugin rules:** See `docs/PLUGIN_GUIDELINES.md`. Key: use `PluginContext` for DI, NEVER import services directly, NEVER call ToastService from plugins.

### PluginContext (Dependency Injection)

Plugins access core services exclusively through `PluginContext` -- never via direct imports. The context is available two ways:

- **In Vue components:** `const ctx = usePluginContext()` (composable from `@/composables/usePluginContext`)
- **In non-Vue code:** `const ctx = await getPluginContext()` (factory from `@/services/PluginContextFactory`)

Available interfaces on `PluginContext` (defined in `src/types/plugin-context.ts`):

| Interface           | Key methods                                                                           |
| ------------------- | ------------------------------------------------------------------------------------- |
| `ctx.activity`      | `saveActivityWithDetails()`, `getAllActivities()`, `getDetails()`, `deleteActivity()` |
| `ctx.storage`       | `getData()`, `saveData()`, `deleteData()`, `exportDB()`                               |
| `ctx.notifications` | `notify(message, { type, timeout })`                                                  |
| `ctx.plugins`       | `isPluginActive(id)`, `enablePlugin(id)`                                              |
| `ctx.aggregation`   | `getAggregated(metric, period)`, `listMetrics()`                                      |
| `ctx.friends`       | `publishPublicData()`, `getMyManifestUrl()`                                           |
| `ctx.analyzer`      | `create(samples)` returns `{ bestSegments() }`                                        |

### Creating a New Plugin

1. Create folder matching the type's path pattern (e.g. `plugins/data-providers/MyProvider/client/`)
2. Create `index.ts` with `export default { ... } as ProviderPlugin`
3. Access services via `PluginContext` only -- NEVER import from `@/services/`
4. For notifications, use `ctx.notifications.notify()` -- NEVER import ToastService
5. Use CSS variables from `src/assets/styles/variables.css` -- NEVER hardcode colors
6. Handle missing data gracefully (not all activities have HR, power, etc.)

See `docs/PLUGIN_GUIDELINES.md` for complete guide with examples.

### Core Services

| Service                | Purpose                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **ActivityService**    | CRUD with atomic transactions, versioning, soft delete. Emits `activity-changed` events.                                               |
| **SyncService**        | Manual sync with conflict detection (version + timestamp), incremental sync.                                                           |
| **AggregationService** | Event-driven O(1) aggregation, listens to ActivityService events.                                                                      |
| **IndexedDBService**   | Singleton IndexedDB access (v9). Stores: settings, activities, activity_details, aggregatedData, notifLogs, friends, friend_activities |
| **ActivityAnalyzer**   | Segmentation, best efforts, slope analysis, averages.                                                                                  |
| **MigrationService**   | App-level data migrations on version upgrades. See `src/migrations/`.                                                                  |
| **ToastService**       | UI-only notifications. NEVER call from business logic services.                                                                        |

**Deprecated:** ActivityDBService (use ActivityService), StorageListener (use SyncService).

### Event-Driven Architecture

Services emit events via `EventTarget`, UI components listen and react. Business logic services NEVER call `ToastService.push()` directly -- emit events instead.

### Data Types (src/types/activity.ts)

- **Timestamped**: Base with `id`, `version`, `lastModified`, `synced?`, `deleted?`
- **Activity** (extends Timestamped): Metadata (date, distance, type, provider)
- **ActivityDetails** (extends Timestamped): Full data with `samples[]` and `laps[]`
- **Sample**: Time-series point (timeOffset, speed, heartRate, cadence, elevation, position, power)

## Rules -- MUST FOLLOW

### Design (see docs/DESIGN_GUIDELINES.md)

- **ALWAYS** use CSS variables from `src/assets/styles/variables.css` -- NEVER hardcode colors
- **ALWAYS** use Font Awesome 6 (Free) -- NEVER use emojis in production code
- **ALWAYS** add `aria-hidden="true"` to icon elements

### Code Style

- Prettier: no semi, single quotes, trailing comma none, 100 chars
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `style:`, `docs:`, `test:`
- Path aliases: `@` = `./src`, `@plugins` = `./plugins`

### Testing

- Unit: Vitest + Vue Test Utils + happy-dom. Coverage target: 60%+
- E2E: Cypress. Use `data-test` attributes for selectors.

### Versioning & Releases (auto-bump)

**La version est gérée automatiquement.** Ne JAMAIS bumper manuellement `package.json`.

- Chaque merge sur `main` déclenche `.github/workflows/version-bump.yml` (patch par défaut)
- Labels PR : `release:major`, `release:minor` pour override le type de bump
- Le workflow commit `chore(release): vX.Y.Z`, crée le tag, et déploie en prod
- `deploy-production.yml` reste dispo en `workflow_dispatch` pour redeploy manuel sans bump
- **Ne JAMAIS** modifier `version` dans `package.json`, créer de commits `chore: bump version`, ou créer de tags `v*` manuellement

### Common Pitfalls

- Plugin exports must use `export default` (not named exports)
- Plugin folder structure must match the type's path pattern
- UI widgets should handle missing data gracefully (not all activities have HR, power, etc.)
- When modifying IndexedDB schema, add migration logic in `src/migrations/`

## Related Documentation

- Design rules: `docs/DESIGN_GUIDELINES.md`
- Plugin architecture: `docs/PLUGIN_GUIDELINES.md`
- Technical roadmap: `docs/ROADMAP_TECHNIQUE.md`
- Deployment: `docs/DEPLOYMENT.md`

---

# Axon — Impact-driven development

This project uses axon for structural impact analysis. Use `/wanadev-axon-plan` for the full workflow.

## Risk thresholds

| Condition                                    | Action                            |
| -------------------------------------------- | --------------------------------- |
| Sensitive cluster (Payments / Auth / Export) | **STOP** — explicit confirmation  |
| will_break > 10 symbols                      | **STOP** — explicit confirmation  |
| will_break 4–10 symbols                      | Present report, wait for "ok"     |
| will_break ≤ 3 symbols                       | Proceed, mention affected symbols |

## Axon MCP tools

```
axon_query("concept")       axon_context("Symbol")      axon_impact("Symbol")
axon_dead_code()            axon_detect_changes()        axon_cypher("MATCH ...")
```

## Sensitive clusters

<!-- Fill in after axon analyze -->

- _To be filled_
