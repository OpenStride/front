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
   - Core sync logic: `StorageService.ts`

3. **App Extensions** (`plugins/app-extensions/*/index.ts`)
   - UI widgets injected into activity detail views
   - Interface: `ExtensionPlugin` (src/types/extension.ts)
   - Registry: `ExtensionPluginRegistry.ts`
   - Slots: `activity.top`, `activity.widgets`
   - Consumed by: `useSlotExtensions` composable → `ActivityDetails.vue`

### Core Services

| Service | Purpose | Location |
|---------|---------|----------|
| **ActivityAnalyzer** | Analyzes activity samples: segmentation, best efforts, slope analysis, averages | src/services/ActivityAnalyzer.ts |
| **IndexedDBService** | Singleton for IndexedDB access. Stores: `settings`, `activities`, `activity_details`, `notifLogs` | src/services/IndexedDBService.ts |
| **StorageService** | Orchestrates sync between local IndexedDB and remote storage plugins. Handles merge conflicts via timestamp | src/services/StorageService.ts |
| **AggregationService** | Computes aggregate metrics (weekly/monthly stats, progress) across activities | src/services/AggregationService.ts |
| **ActivityDBService** | CRUD operations for activities in IndexedDB | src/services/ActivityDBService.ts |
| **DataProviderService** | Coordinates data provider plugins to import activities | src/services/DataProviderService.ts |
| **StorageListener** | Watches IndexedDB changes and triggers automatic backup via storage plugins | src/services/StorageListener.ts |

### Data Flow

```
1. Data Provider Plugin → Adapter → Internal Activity format
2. Store in IndexedDB (IndexedDBService)
3. On demand: Analyze with ActivityAnalyzer
4. Render UI widgets via ExtensionPlugins
5. Optional: Sync to remote storage via StoragePlugins
```

### Bootstrap Sequence (src/main.ts)

1. Initialize `IndexedDBService`
2. Load aggregation config from settings
3. Create Vue app + router
4. Mount app
5. Setup backup listener (watches IndexedDB changes)
6. Listen for `activity_details` changes to trigger aggregation updates

## Key Data Types

Defined in `src/types/activity.ts`:

- **Activity**: Minimal metadata (id, date, distance, type, providerId)
- **Sample**: Time-series data point (timeOffset, speed, heartRate, cadence, elevation, position, power, temperature, etc.)
- **ActivityDetails**: Full activity with samples array + laps + derived stats
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

- Full product vision and architecture: `README` (French)
- Conventional commits expected for contributions
- AI assistant project: https://chatgpt.com/g/g-p-67d572f93a0481919a72209e081cc282-open-stride/project
