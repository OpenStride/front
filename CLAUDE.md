# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenStride is a **local-first, privacy-focused Vue 3 / TypeScript application** for athletes to visualize, analyze, and preserve their sports activity data (running, trail running, cycling) without relying on closed platforms. The app operates entirely in the browser using IndexedDB for storage, with optional cloud backup plugins.

**Core Principles:**
- **Local-first**: Works offline, data stored in IndexedDB
- **Privacy**: Opt-in for any remote sync, no forced cloud storage
- **Extensibility**: Plugin-based architecture for data sources, storage, and UI widgets
- **Transparency**: Open algorithms for metrics calculation (VO2, splits, segments)

## Development Commands

```bash
# Development server (localhost:3000)
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview production build (localhost:4173)
npm run preview

# Linting
npm run lint

# Run unit tests (Vitest)
npm run test:unit

# Run single test file
npm run test:unit tests/unit/ActivityAnalyzer.spec.ts

# Run E2E tests (Cypress)
npm run test:e2e

# Run E2E tests interactively
npx cypress open
```

## Architecture Overview

### Plugin System (Auto-Discovery)

The application uses **`import.meta.glob`** to automatically discover and register plugins. No manual registration required.

**Three plugin types:**

1. **Data Providers** (`plugins/data-providers/*/client/index.ts`)
   - Import activities from external sources (Garmin, Coros, ZIP/FIT files)
   - Interface: `ProviderPlugin` (src/types/provider.ts)
   - Registry: `ProviderPluginRegistry.ts`
   - Managed by: `DataProviderPluginManager.ts`

2. **Storage Providers** (`plugins/storage-providers/*/client/index.ts`)
   - Optional backup destinations (Google Drive, etc.)
   - Interface: `StoragePlugin` (src/types/storage.ts)
   - Registry: `StoragePluginRegistry.ts`
   - Managed by: `StoragePluginManager.ts`
   - Core sync logic: `SyncService.ts` (manual, incremental, with conflict detection)

3. **App Extensions** (`plugins/app-extensions/*/index.ts`)
   - UI widgets injected into activity detail views
   - Interface: `ExtensionPlugin` (src/types/extension.ts)
   - Registry: `ExtensionPluginRegistry.ts`
   - Slots: `activity.top`, `activity.widgets`
   - Consumed by: `useSlotExtensions` composable → `ActivityDetails.vue`

### Core Services

| Service | Purpose | Location |
|---------|---------|----------|
| **ActivityService** | 🆕 Unified CRUD with atomic transactions, versioning, soft delete. Emits events for reactive services. Replaces ActivityDBService. | src/services/ActivityService.ts |
| **SyncService** | 🆕 Manual sync with conflict detection (version + timestamp), incremental sync (synced flag), LWW resolution. Replaces StorageService backup logic. | src/services/SyncService.ts |
| **AggregationService** | 🔄 Event-driven O(1) aggregation. Listens to ActivityService events instead of O(n) scans. Supports deletions. | src/services/AggregationService.ts |
| **IndexedDBService** | Singleton for IndexedDB access (v9). Stores: `settings`, `activities`, `activity_details`, `aggregatedData`, `notifLogs`, `friends`, `friend_activities` | src/services/IndexedDBService.ts |
| **ActivityAnalyzer** | Analyzes activity samples: segmentation, best efforts, slope analysis, averages | src/services/ActivityAnalyzer.ts |
| **DataProviderService** | Coordinates data provider plugins to import activities | src/services/DataProviderService.ts |
| ~~**ActivityDBService**~~ | ❌ Deprecated. Replaced by ActivityService. | ~~src/services/ActivityDBService.ts~~ |
| ~~**StorageService**~~ | ⚠️ Partially deprecated. importFromRemote() still used for initial hydration. Sync logic moved to SyncService. | src/services/StorageService.ts |
| ~~**StorageListener**~~ | ❌ Removed. Automatic backup replaced by manual sync via SyncService. | ~~src/services/StorageListener.ts~~ |

### Data Flow (Post-Refactoring 2026)

```
1. Data Provider Plugin → Adapter → Internal Activity format (with versioning)
2. ActivityService.saveActivityWithDetails() → Atomic transaction → IndexedDB
3. ActivityService emits 'activity-changed' event
4. AggregationService listens → Updates aggregations (O(1))
5. On demand: Analyze with ActivityAnalyzer
6. Render UI widgets via ExtensionPlugins
7. Manual sync: User clicks Refresh → SyncService.syncNow()
   - Incremental sync (only unsynced activities)
   - Conflict detection (version + timestamp)
   - LWW resolution with Toast notification
8. Sync to remote storage via StoragePlugins
```

### Bootstrap Sequence (src/main.ts)

1. Initialize `IndexedDBService` (v9 with versioning support)
2. Load aggregation config from settings
3. **Start event-driven aggregation** (`aggregationService.startListening()`)
4. Create Vue app + router
5. Mount app
6. Sync friends' activities in background (non-blocking)

**Removed (2026 refactoring)** :
- ❌ Automatic backup listener (replaced by manual sync)
- ❌ O(n) scan listener for aggregations (replaced by event-driven)

## Key Data Types

Defined in `src/types/activity.ts`:

- **Timestamped** (🆕 2026): Base interface for versioning and sync tracking
  - `id: string` - Unique identifier
  - `version: number` - Incremented on each modification (conflict detection)
  - `lastModified: number` - Timestamp in ms (conflict resolution)
  - `synced?: boolean` - True if synced to remote storage (incremental sync)
  - `deleted?: boolean` - Soft delete flag (sync deletions)

- **Activity** (extends Timestamped): Minimal metadata (id, date, distance, type, providerId, version, lastModified, synced, deleted)
- **ActivityDetails** (extends Timestamped): Full activity with samples array + laps + derived stats + versioning
- **Sample**: Time-series data point (timeOffset, speed, heartRate, cadence, elevation, position, power, temperature, etc.)
- **Lap**: Manual or auto lap markers (time, distance)

## Path Aliases

Configured in `vite.config.ts` and `vitest.config.ts`:

- `@` → `./src`
- `@plugins` → `./plugins`

## Testing

- **Unit tests**: Vitest + Vue Test Utils + happy-dom environment
- **E2E tests**: Cypress (baseUrl: localhost:3000)
- **Coverage targets** (vitest.config.ts): Services/composables should reach 60%+ (statements, lines, functions), 50%+ branches
- Key test areas:
  - ActivityAnalyzer: segment calculation, slope analysis, best efforts
  - Storage sync: merge logic, conflict resolution
  - Plugin discovery and activation
  - UI widgets with dynamic data

## 🆕 Recent Refactoring (January 2026)

OpenStride underwent a major architecture refactoring to improve performance, data integrity, and sync reliability.

### What Changed

**Week 1 - Foundation** :
- ✅ Added **versioning** (`version` counter + `lastModified` timestamp) to all activities
- ✅ Implemented **soft delete** (`deleted` flag instead of physical deletion)
- ✅ Added **sync tracking** (`synced` flag for incremental sync)
- ✅ Created **ActivityService** with atomic transactions (replaces ActivityDBService)
- ✅ Migrated **IndexedDB v8 → v9** (explicit keyPath, indices)

**Week 2 - SyncService** :
- ✅ **Manual sync** triggered by user (replaced automatic background sync)
- ✅ **Incremental sync** (only unsynced activities)
- ✅ **Conflict detection** (version + timestamp comparison)
- ✅ **LWW conflict resolution** (Last-Write-Wins with Toast notification)
- ✅ **17/17 tests passing** with 100% coverage

**Week 3 - AggregationService Event-Driven** :
- ✅ **O(1) event-driven aggregation** (replaced O(n) scans)
- ✅ **Support for deletions** (decrements aggregates on soft delete)
- ✅ **Decoupled architecture** (listens to ActivityService events)

### Performance Gains

| Operation | Before | After | Gain |
|-----------|--------|-------|------|
| Sync (7,300 activities) | 30-60s | 5-10s (first), <1s (incremental) | ~50x |
| Aggregation per change | 50-100ms (O(n) scan) | 1-2ms (O(1) event) | ~50x |
| Conflict detection | ❌ None | ✅ <1ms | ∞ |

### Migration Guide

See detailed migration guide: `docs/MIGRATION_REFACTORING_2026.md`

**Quick Start** :
```typescript
// OLD: ActivityDBService
import { getActivityDBService } from '@/services/ActivityDBService';
const activityDB = await getActivityDBService();
await activityDB.saveActivities([activity]);
await activityDB.saveDetails([details]);

// NEW: ActivityService (atomic transaction)
import { getActivityService } from '@/services/ActivityService';
const activityService = await getActivityService();
await activityService.saveActivitiesWithDetails([activity], [details]);

// OLD: StorageService (automatic, O(n))
await storageService.syncStores([{ store: 'activities', key: '' }]);

// NEW: SyncService (manual, incremental, conflict detection)
import { getSyncService } from '@/services/SyncService';
const syncService = getSyncService();
const result = await syncService.syncNow();
// { success: true, activitiesSynced: 5, errors: [] }
```

### Breaking Changes

⚠️ **IndexedDB v8 → v9 migration will reset local data**
- Backup to Google Drive before updating
- Reconnect providers after migration

See full changelog: `docs/CHANGELOG_REFACTORING_2026.md`

## Plugin Development

### Adding a Data Provider

Create `plugins/data-providers/<provider-id>/client/index.ts`:

```typescript
import type { ProviderPlugin } from '@/types/provider'

export default {
  id: 'my-provider',
  label: 'My Provider',
  description: 'Import from My Service',
  icon: 'fa-icon-name',
  setupComponent: () => import('./Setup.vue'),
  refreshData: async () => { /* optional refresh logic */ }
} as ProviderPlugin
```

### Adding a Storage Provider

Create `plugins/storage-providers/<storage-id>/client/index.ts`:

```typescript
import type { StoragePlugin } from '@/types/storage'

export default {
  id: 'my-storage',
  label: 'My Storage',
  setupComponent: () => import('./Setup.vue'),
  async readRemote(store: string): Promise<any[]> { /* ... */ },
  async writeRemote(store: string, data: any[]): Promise<void> { /* ... */ },
  // Optional optimization methods:
  // getRemoteManifest, optimizeImport, updateManifest
} as StoragePlugin
```

### Adding App Extension (UI Widgets)

Create `plugins/app-extensions/<extension-id>/index.ts`:

```typescript
import type { ExtensionPlugin } from '@/types/extension'

export default {
  id: 'my-extension',
  label: 'My Extension',
  slots: {
    'activity.top': [
      () => import('./TopWidget.vue')
    ],
    'activity.widgets': [
      () => import('./Widget1.vue'),
      () => import('./Widget2.vue')
    ]
  }
} as ExtensionPlugin
```

**Widget component props** (ActivityDetails.vue passes these):
- `activity`: Activity object
- `details`: ActivityDetails object (includes samples)

## Design Guidelines

**CRITICAL**: Always follow design guidelines for visual consistency.

### Colors
- **ALWAYS** use CSS variables from `src/assets/styles/variables.css`
- **NEVER** hardcode colors like `#88aa00`, `#10b981`, etc.
- Primary green: `var(--color-green-500)` (#88aa00)
- Hover states: `var(--color-green-600)` (#6d8a00)

### Icons
- **ALWAYS** use Font Awesome 6 (Free) for icons
- **NEVER** use emojis (🏃, 👤, 🌐, etc.) in production code
- Common: `fas fa-user`, `fas fa-lock`, `fas fa-globe`, `fas fa-person-running`
- Add `aria-hidden="true"` to icon elements

See [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md) for complete rules and icon catalog.

## Important Notes

### Environment Variables
- Only `VITE_*` prefixed variables are exposed to the client
- Never commit secrets (API keys, tokens)
- Providers use PKCE flow for OAuth (e.g., Google Drive)

### Security & Privacy
- All data processing happens client-side
- No analytics or tracking by default
- GPS masking and local encryption planned for future versions
- Storage sync is **opt-in only**

### Performance Considerations
- ActivityAnalyzer works synchronously; consider Web Workers for large datasets (5k+ activities)
- Leaflet maps lazy-load for activity preview
- Chart.js used for visualizations

### Aggregation System
- Listens to `activity_details` insertions via IndexedDBService events
- Incrementally updates aggregate metrics (best efforts, weekly totals)
- Configuration stored in IndexedDB settings

### Common Pitfalls
- Plugin exports must use `export default` (not named exports)
- Plugin folder structure must match: `plugins/<category>/<id>/client/index.ts` or `plugins/app-extensions/<id>/index.ts`
- Storage plugins must implement both `readRemote` and `writeRemote`
- UI widgets should handle missing data gracefully (not all activities have HR, cadence, etc.)
- When modifying IndexedDBService schema, ensure migration logic is added

## Roadmap Context

Current version: **0.1** (POC phase)
- Core local-first functionality established
- Garmin and Coros providers operational
- Google Drive storage plugin functional
- Essential widgets implemented

Planned features (see README sections 12, 19):
- Advanced merge strategies (CRDT)
- End-to-end encryption
- GPS track masking
- AI assistant for workout analysis (privacy-preserving, local-first)
- Plugin catalog UI
- Batch import via drag & drop
- Internationalization

## Related Documentation

- Full product vision and architecture: `README.md`
- Conventional commits expected for contributions
- Technical roadmap and analysis: `docs/` folder
