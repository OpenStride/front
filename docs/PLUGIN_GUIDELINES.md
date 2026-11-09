# Plugin Development Guidelines

This document defines the architectural patterns and best practices for developing OpenStride plugins.

## Table of Contents

1. [Architecture Principles](#architecture-principles)
2. [Dependency Injection](#dependency-injection)
3. [Allowed Patterns](#allowed-patterns)
4. [Forbidden Patterns](#forbidden-patterns)
5. [Plugin Types](#plugin-types)
6. [Examples](#examples)
7. [Testing](#testing)
8. [Migration Guide](#migration-guide)

---

## Architecture Principles

OpenStride follows a **plugin-based architecture** with strict separation of concerns:

- **Plugins** provide domain-specific functionality (data import, storage, UI widgets)
- **Core services** handle cross-cutting concerns (persistence, sync, aggregation)
- **Dependency Injection** decouples plugins from core service implementations

### Why Dependency Injection?

✅ **Benefits:**

- Plugins don't break when core services are refactored
- Easy to test plugins with mocked services
- Clear contract via TypeScript interfaces
- Zero runtime overhead (no proxy layers)

❌ **Without DI:**

- Direct imports create tight coupling
- Plugin updates required after every service refactoring
- Impossible to test in isolation
- Circular dependency risks

---

## Dependency Injection

### PluginContext Interface

All plugins receive a `PluginContext` object that provides access to core services:

```typescript
// In Vue components:
import { usePluginContext } from '@/composables/usePluginContext'
const ctx = usePluginContext()

// In non-Vue code (services, managers):
import { getPluginContext } from '@/services/PluginContextFactory'
const ctx = await getPluginContext()
```

```typescript
export interface PluginContext {
  activity: IActivityService // CRUD on activities, setGear / setSport / setTitle
  storage: IPluginStorageService // Settings and plugin-specific data
  notifications: INotificationService // User-facing notifications (t('key') only)
  plugins: IPluginManager // Check/enable other plugins
  aggregation: IAggregationService // Read aggregated stats
  aggregates: ICustomAggregateService // The reader's custom aggregates
  gear: IGearService // Shoes, bikes: list, create, update, remove
  photos: IPhotoService // An outing's photos: list, add, blob, remove
  friends: IFriendService // Public data, sharing, a friend's shared photos
  analyzer: IAnalyzerFactory // Activity analysis (best segments, elevation)
  sync: ISyncService // Trigger a sync
  units: IUnitsService // SI values -> the user's unit system
  providers: IDataProviderEvents // Imports finished by a data provider
  tasks: IBackgroundTasks // Long jobs (a first import), shown on every page
}
```

`src/types/plugin-context.ts` is the reference: every method is documented
there.

### The doors between a plugin and the core

A test (`tests/unit/contracts.spec.ts`, "the core and the plugins meet at known
doors") holds this boundary in both directions.

**A plugin may import from the core:**

|                                                                                               |                                                                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@/composables/usePluginContext` (components), `@/services/PluginContextFactory` (other code) | The services, through the context                                                    |
| `@/types/*`, `@/utils/*`                                                                      | Types and pure helpers                                                               |
| `@/composables/*`                                                                             | The public composables (`useUnits`, `useActivityMetricsIndex`, `useSlotExtensions`…) |
| `MapPreview`, `MyQrCodeModal`, `providers/DefaultProviderSetup`                               | The UI kit: core components a plugin may reuse                                       |

Nothing else from `@/services/`, `@/components/`, `@/views/` or `@/router/`. A type
a plugin needs lives in `src/types`, not in a service file. A component that
should join the UI kit is added to `PLUGIN_UI_KIT` in the contract, deliberately.

**The core never imports a plugin by name.** It discovers them
(`import.meta.glob`) and talks to them through their interface
(`ProviderPlugin`, `StoragePlugin`, `ExtensionPlugin`). A core that names a
plugin cannot run without it.

### Available Services

#### IActivityService

**Purpose:** Manage activities (create, read, update, delete)

```typescript
interface IActivityService {
  saveActivityWithDetails(activity: Activity, details: ActivityDetails): Promise<void>
  saveActivitiesWithDetails(activities: Activity[], details: ActivityDetails[]): Promise<void>
  getActivity(id: string): Promise<Activity | undefined>
  getAllActivities(): Promise<Activity[]>
  getDetails(id: string): Promise<ActivityDetails | undefined>
  deleteActivity(id: string): Promise<void>
  getUnsyncedActivities(): Promise<Activity[]>
  markAsSynced(activityIds: string[]): Promise<void>
}
```

#### IStorageService

**Purpose:** Store plugin-specific settings and configuration

```typescript
interface IStorageService {
  getData<T>(key: string): Promise<T | undefined>
  saveData<T>(key: string, data: T): Promise<void>
  deleteData(key: string): Promise<void>
  exportDB(storeName: string): Promise<any[]>
  addItemsToStore<T>(storeName: string, items: T[], keyFn: (item: T) => any): Promise<void>
}
```

#### INotificationService

**Purpose:** Show user-facing notifications (replaces direct ToastService calls)

```typescript
interface INotificationService {
  notify(
    message: string,
    opts?: {
      type?: 'success' | 'error' | 'info' | 'warning'
      timeout?: number
    }
  ): void
}
```

#### IPluginManager

**Purpose:** Check or enable other plugins

```typescript
interface IPluginManager {
  isPluginActive(pluginId: string): Promise<boolean>
  enablePlugin(pluginId: string): Promise<void>
}
```

#### IAggregationService

**Purpose:** Read pre-computed aggregated data (weekly/monthly stats)

```typescript
interface IAggregationService {
  getAggregated(metricId: string, periodType: AggregationPeriod): Promise<AggregatedRecord[]>
  listMetrics(): AggregationMetricDefinition[]
}
```

#### IFriendService

**Purpose:** Publish public data and manage friend relationships

```typescript
interface IFriendService {
  publishPublicData(): Promise<string | null>
  getMyManifestUrl(): Promise<string | null>
}
```

#### IAnalyzerFactory

**Purpose:** Create activity analyzers for computing best segments

```typescript
interface IAnalyzerFactory {
  create(samples: Sample[]): {
    bestSegments(targets: number[]): Record<number, { duration: number } | undefined>
  }
}
```

---

## Allowed Patterns

### ✅ Use PluginContext for Service Access

**In Vue components (composable):**

```typescript
// plugins/data-providers/MyProvider/client/Setup.vue
import { usePluginContext } from '@/composables/usePluginContext'

const ctx = usePluginContext()
const config = await ctx.storage.getData('myProviderConfig')
ctx.notifications.notify('Connected!', { type: 'success' })
```

**In non-Vue code (factory):**

```typescript
// plugins/data-providers/MyProvider/client/MyService.ts
import { getPluginContext } from '@/services/PluginContextFactory'

async function syncActivities() {
  const ctx = await getPluginContext()
  const activities = await ctx.activity.getAllActivities()
  await ctx.activity.saveActivitiesWithDetails(newActivities, newDetails)
}
```

### ✅ Store Plugin Configuration in Settings

**Good:**

```typescript
// Save plugin-specific config
await context.storage.saveData('myPlugin_apiKey', 'abc123')
await context.storage.saveData('myPlugin_lastSync', Date.now())

// Read config
const apiKey = await context.storage.getData<string>('myPlugin_apiKey')
```

**Naming convention:** Prefix keys with `{pluginId}_` to avoid collisions.

### ✅ Lazy Initialization

**Good:**

```typescript
export default {
  id: 'my-extension',

  async setupComponent() {
    // Initialize heavy resources HERE (when user clicks setup)
    const service = await initializeExternalService()
    return import('./Setup.vue')
  }
} as ExtensionPlugin
```

### ✅ Graceful Degradation

**Good:**

```typescript
async refreshData(context: PluginContext) {
    try {
        const data = await fetchFromAPI();
        await context.activity.saveActivitiesWithDetails(data.activities, data.details);
    } catch (error) {
        console.error('[MyPlugin] Failed to fetch:', error);
        // Don't throw - let app continue working
        return { success: false, error: String(error) };
    }
}
```

---

## Forbidden Patterns

### ❌ Direct Service Imports

**Bad:**

```typescript
// ❌ DON'T DO THIS
import { getActivityDBService } from '@/services/ActivityDBService'
import { IndexedDBService } from '@/services/IndexedDBService'

const activityDB = await getActivityDBService()
await activityDB.saveActivities(activities) // WRONG!
```

**Why it's bad:**

- Tight coupling to concrete implementations
- Plugin breaks when service is refactored
- Impossible to test in isolation

**Fix:** Use `PluginContext` instead (see [Allowed Patterns](#allowed-patterns))

### ❌ Direct Toast/UI Service Calls

**Bad:**

```typescript
// ❌ DON'T DO THIS
import { ToastService } from '@/services/ToastService'

ToastService.push('Import completed', { type: 'success' }) // WRONG!
```

**Why it's bad:**

- Business logic coupled to UI layer
- Can't test without Vue runtime
- Violates separation of concerns

**Fix:** Use `ctx.notifications.notify()` or return status

```typescript
// ✅ CORRECT — use PluginContext notifications
const ctx = usePluginContext()
ctx.notifications.notify('Import completed', { type: 'success' })

// ✅ ALSO CORRECT — return status, let parent handle UI
async refreshData(context: PluginContext) {
    // ... do work ...
    return { success: true, activitiesImported: 42 };
}
```

### ❌ Module-Level Initialization

**Bad:**

```typescript
// ❌ DON'T DO THIS
import { NotificationService } from './NotificationService'

// Runs immediately when module loads
const service = NotificationService.getInstance()
service.initialize() // WRONG!

export default {
  id: 'my-plugin'
  // ...
}
```

**Why it's bad:**

- Wastes resources if plugin isn't used
- No control over initialization timing
- Can fail before user configures plugin

**Fix:** Use lazy initialization in `setupComponent()` (see [Allowed Patterns](#allowed-patterns))

### ❌ Direct Store Access Without Context

**Bad:**

```typescript
// ❌ DON'T DO THIS
import { IndexedDBService } from '@/services/IndexedDBService'

const db = await IndexedDBService.getInstance()
await db.addItemsToStore('activities', myActivities, a => a.id) // WRONG!
```

**Why it's bad:**

- Bypasses versioning and sync tracking
- Can create data inconsistencies
- No event emission for aggregation

**Fix:** Use `context.activity.saveActivitiesWithDetails()` instead

### Retiring a Data Provider

Set `deprecated: true` on the plugin rather than deleting it. It disappears from
every list that offers a new connection, while staying resolvable so anyone who
already connected it keeps a working setup page and their imported activities
keep their provenance.

```typescript
const MyProvider: ProviderPlugin = {
  id: 'my-provider',
  label: 'My Provider',
  deprecated: true,
  setupComponent: async () => (await import('./Setup.vue')).default
}
```

Offer lists use `installableProviderPlugins`; resolution paths keep using
`allProviderPlugins`. Mixing the two up either strands existing users or keeps
offering a retired provider.

### ❌ Converting Units by Hand

Most of the app's charts and statistics live in plugins. A conversion written by
hand is a place that ignores the user's unit preference — an imperial user was
reading kilometres in their own statistics because of exactly this.

```typescript
// ❌ WRONG
const km = activity.distance / 1000
const kmh = (speed * 3.6).toFixed(1) + ' km/h'

// ✅ CORRECT — values are stored in SI, converted at display time
const { units } = usePluginContext()
units.format('distance', activity.distance).text // "6.21 mi" or "10.00 km"
units.convert('speed', speed).value // a number, for a chart axis
```

A `<canvas>` chart sits outside Vue's reactivity, so it must redraw itself:

```typescript
watch(
  () => units.system,
  () => drawCanvas()
)
```

**Never store a converted value.** Records and caches must stay in SI, or they
would depend on a display preference. See `docs/SPORT_AND_UNITS.md`.

### ❌ Importing Other Plugins

**Bad:**

```typescript
// ❌ DON'T DO THIS
import { GarminService } from '@plugins/data-providers/GarminProvider/client/GarminService'

const garmin = new GarminService() // WRONG!
```

**Why it's bad:**

- Creates tight coupling between plugins
- Circular dependency risk
- Violates plugin isolation

**Fix:** Plugins should be completely independent

---

## Plugin Types

### Data Provider Plugin

**Structure:**

```
plugins/data-providers/MyProvider/
├── client/
│   ├── index.ts        ← Plugin definition (REQUIRED)
│   ├── Setup.vue       ← Setup UI component
│   └── MyService.ts    ← Business logic (optional)
└── README.md
```

**Example:**

```typescript
// client/index.ts
import type { ProviderPlugin } from '@/types/provider'
import type { PluginContext } from '@/types/plugin-context'

export default {
  id: 'my-provider',
  label: 'My Provider',
  description: 'Import activities from My Service',
  icon: 'fa-cloud-download',

  setupComponent: () => import('./Setup.vue'),

  async refreshData(context: PluginContext) {
    // 1. Fetch from external API
    const apiKey = await context.storage.getData<string>('myProvider_apiKey')
    const rawActivities = await fetchFromMyAPI(apiKey)

    // 2. Transform to internal format
    const activities = rawActivities.map(transformToActivity)
    const details = rawActivities.map(transformToDetails)

    // 3. Save via context
    await context.activity.saveActivitiesWithDetails(activities, details)

    return { success: true, count: activities.length }
  }
} as ProviderPlugin
```

### Storage Provider Plugin

**Structure:**

```
plugins/storage-providers/MyStorage/
├── client/
│   ├── index.ts
│   └── Setup.vue
└── README.md
```

**Example:**

```typescript
// client/index.ts
import type { StoragePlugin } from '@/types/storage'

export default {
  id: 'my-storage',
  label: 'My Storage',

  setupComponent: () => import('./Setup.vue'),

  async readRemote(store: string): Promise<any[]> {
    const apiKey = await getMyStorageAPIKey()
    return await fetchFromMyStorage(store, apiKey)
  },

  async writeRemote(store: string, data: any[]): Promise<void> {
    const apiKey = await getMyStorageAPIKey()
    await uploadToMyStorage(store, data, apiKey)
  }
} as StoragePlugin
```

**Note:** Storage plugins should use `PluginContext` for all service access, same as other plugin types.

### Sign-in: callbacks and connection state

A provider that signs in through OAuth owns the whole round trip. The core
holds no callback page, and it never reads a token.

- **The callback page** belongs to the plugin, declared in `routes`. A data or
  storage plugin's routes are reachable **whether it is enabled or not**,
  because the provider redirects back while the plugin is still being
  connected. The path is the one registered with the provider: changing it
  there and here is one change.

  ```typescript
  routes: [
    {
      path: '/oauth/my-provider/callback',
      name: 'MyProviderOAuthCallback',
      component: async () => (await import('./OAuthCallback.vue')).default
    }
  ]
  ```

  A plugin can also redirect back to its own setup page
  (`/storage-provider/<id>` or `/data-provider/<id>`) and read the `code` there,
  as Google Drive does. It then needs no route at all.

- **Connection state:** a storage plugin answers `isConnected()`. The
  onboarding asks it after the sign-in, instead of guessing which setting
  holds the token. A plugin without it counts as not connected.

### Writing a new storage plugin (Dropbox, OneDrive, WebDAV…)

Google Drive (`plugins/storage-providers/GDrive/`) is the reference. A new
provider needs **no change in the core**: drop the folder in place and the
registry finds it. If adding one tempts you to edit `src/`, that edit belongs
behind an optional field of `StoragePlugin` (`src/types/storage.ts`) instead,
so the next provider gets it too.

#### Two sides in one plugin

A storage plugin serves two kinds of people, and keeps them apart.

| Side                                  | Who uses it                                                                                    | What it may touch                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Account** (`index.ts` and the rest) | The user who connected this provider: backup, sync, publishing their profile, photos           | Its sign-in, tokens, the `PluginContext`                                  |
| **Public reader** (`publicReader.ts`) | Anyone following a friend who publishes there, **with or without an account on this provider** | Nothing but `@/utils/*` and `@/types/*`. No sign-in, no token, no context |

The core loads the public reader of **every bundled storage plugin, enabled or
not**: someone without Dropbox must still see a friend who publishes on
Dropbox. That is why the reader has to stand alone. A contract test
(`a public reader stands alone…` in `tests/unit/contracts.spec.ts`) fails the
build if `publicReader.ts` imports anything else.

The reader never sees the share key either. It returns the file as stored, and
the core opens sealed files with the friend's key (`PublicKeyRing`).

#### What to implement

| Field                                                                                                                  | Required                        | Used for                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`, `label`, `icon`, `setupComponent`                                                                                | yes                             | The provider list and its setup page (`/storage-provider/<id>`)                                |
| `readRemote(store)`, `writeRemote(store, rows)`                                                                        | yes                             | Backup and multi-device sync of each store (`SyncService` merges, the plugin only moves JSON)  |
| `isConnected()`                                                                                                        | strongly                        | The onboarding, after sign-in                                                                  |
| `routes`                                                                                                               | if OAuth needs a fixed callback | See _Sign-in_ above                                                                            |
| `getRemoteChangeToken(store)`                                                                                          | no                              | Skips a full download when nothing changed (an etag, a revision, a checksum)                   |
| `supportsPublicFiles`, `writePublicFile`, `getPublicFileUrl`, `clearPublicFiles`, `extractFileIdFromUrl`, `deleteFile` | to publish a profile to friends | Files **anyone with the link** can read. `writePublicFile` returns that link                   |
| `writeFile`, `readFile`, `deleteFile`                                                                                  | for photos                      | Private binary files (the user's photos), never public                                         |
| `publicHosts`                                                                                                          | to be followed                  | The hosts of the links `writePublicFile` returns. A share link is accepted only on one of them |
| `publicReader`                                                                                                         | only if a plain `fetch` fails   | Reading those links anonymously (CORS, an API key). Without it the core uses `fetch`           |

#### The public reader, step by step

1. Note the host of the links your `writePublicFile` returns, e.g.
   `dl.dropboxusercontent.com` for a Dropbox shared link opened with `?dl=1`,
   and list it in `publicHosts`.
2. Try a plain `fetch` of such a link from the browser. If it returns the JSON
   with CORS headers, stop there: no reader is needed.
3. Otherwise write `client/publicReader.ts`:

   ```typescript
   // plugins/storage-providers/Dropbox/client/publicReader.ts
   import type { PublicReader } from '@/types/publicReader'

   class DropboxPublicReader implements PublicReader {
     async fetchJson(url: string): Promise<unknown> {
       // Anonymous: no token, no PluginContext. Throw when it cannot be read.
       const res = await fetch(toDirectDownload(url))
       if (!res.ok) throw new Error(`HTTP ${res.status}`)
       return res.json()
     }
   }

   export function createPublicReader(): PublicReader {
     return new DropboxPublicReader()
   }
   ```

4. Declare it **lazily**, so its code loads only when a friend's link on those
   hosts is read:

   ```typescript
   // client/index.ts
   publicHosts: ['dl.dropboxusercontent.com'],
   publicReader: async () => (await import('./publicReader')).createPublicReader(),
   ```

#### Checklist

- [ ] `readRemote` / `writeRemote` round-trip every store (`SyncService` sends
      `activities`, `activity_details`, `settings`, `gear`, `activity_photos`…)
- [ ] `deleteFile` treats "already gone" (404) as success
- [ ] Public files are readable by anyone with the link, and private files are never public
- [ ] `publicHosts` matches the host of the links `writePublicFile` returns
- [ ] `publicReader.ts`, if any, imports only `@/utils/*` and `@/types/*`
- [ ] Following a friend works in a browser where this provider was **never connected**
- [ ] Tokens stay inside the plugin. The core asks `isConnected()` and never reads a token
- [ ] Notifications through `ctx.notifications.notify(t('…'))`, never `ToastService`

### App Extension Plugin

**Structure:**

```
plugins/app-extensions/MyExtension/
├── index.ts           ← Plugin definition (NO client/ folder)
├── Widget1.vue
├── Widget2.vue
└── README.md
```

**Example:**

```typescript
// index.ts
import type { ExtensionPlugin } from '@/types/extension'

export default {
  id: 'my-extension',
  label: 'My Extension',

  slots: {
    'activity.top': [() => import('./TopBanner.vue')],
    'activity.widgets': [() => import('./StatsWidget.vue'), () => import('./ChartWidget.vue')]
  }
} as ExtensionPlugin
```

**Widget component props:**

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  activity: Object, // Activity summary
  details: Object // Full activity with samples
})

const avgHeartRate = computed(() => {
  if (!props.details?.samples) return null
  // ... calculate from samples
})
</script>
```

**Outing summary (`activity.summary`):** a component here closes the first panel
of an activity's page, under its figures (rendered by `StandardDetails`'s top
block), rather than opening a block of its own. It receives the same
`data: { activity, details }` as `activity.top`, and should look like one more of
that panel's tiles — the gear an outing wore lives there (`Gear/ActivityGear.vue`).

---

## Examples

### Example 1: Data Provider with Context

```typescript
// plugins/data-providers/StravaProvider/client/index.ts
import type { ProviderPlugin } from '@/types/provider'
import type { PluginContext } from '@/types/plugin-context'
import type { Activity, ActivityDetails } from '@/types/activity'

export default {
  id: 'strava',
  label: 'Strava',
  icon: 'fa-strava',

  setupComponent: () => import('./Setup.vue'),

  async refreshData(context: PluginContext) {
    console.log('[Strava] Fetching activities...')

    // 1. Get OAuth token from settings
    const token = await context.storage.getData<string>('strava_accessToken')
    if (!token) {
      console.warn('[Strava] No access token found')
      return { success: false, error: 'Not authenticated' }
    }

    // 2. Fetch from Strava API
    const response = await fetch('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) {
      return { success: false, error: 'API request failed' }
    }

    const rawActivities = await response.json()

    // 3. Transform to OpenStride format
    const activities: Activity[] = []
    const details: ActivityDetails[] = []

    for (const raw of rawActivities) {
      activities.push({
        id: `strava_${raw.id}`,
        startTime: new Date(raw.start_date).getTime(),
        distance: raw.distance,
        duration: raw.moving_time * 1000,
        sport: raw.type === 'Run' ? 'running' : 'cycling',
        provider: 'strava',
        title: raw.name,
        version: 0,
        lastModified: Date.now(),
        synced: false,
        deleted: false
      })

      // Fetch detailed streams if needed
      const streams = await fetchStravaStreams(raw.id, token)
      details.push(transformStreamsToDetails(raw.id, streams))
    }

    // 4. Save via context (atomic, with versioning)
    await context.activity.saveActivitiesWithDetails(activities, details)

    console.log(`[Strava] Imported ${activities.length} activities`)
    return { success: true, count: activities.length }
  }
} as ProviderPlugin
```

### Example 2: App Extension Widget

```vue
<!-- plugins/app-extensions/PowerAnalysis/PowerWidget.vue -->
<template>
  <div class="power-widget">
    <h3>Power Analysis</h3>
    <div v-if="hasPowerData">
      <p>Average Power: {{ avgPower }} W</p>
      <p>Normalized Power: {{ normalizedPower }} W</p>
      <p>Training Stress Score: {{ tss }}</p>
    </div>
    <p v-else class="no-data">No power data available</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  activity: Object,
  details: Object
})

const hasPowerData = computed(() => {
  return props.details?.samples?.some(s => s.power != null)
})

const avgPower = computed(() => {
  if (!hasPowerData.value) return null
  const samples = props.details.samples.filter(s => s.power)
  return Math.round(samples.reduce((sum, s) => sum + s.power, 0) / samples.length)
})

const normalizedPower = computed(() => {
  // Calculate NP using 30s rolling average
  // ... implementation
})

const tss = computed(() => {
  // Calculate TSS based on FTP
  // ... implementation
})
</script>
```

---

## Testing

### Unit Testing Plugins

**Example using Vitest:**

```typescript
// tests/unit/MyProvider.spec.ts
import { describe, it, expect, vi } from 'vitest'
import type { PluginContext } from '@/types/plugin-context'
import MyProvider from '@plugins/data-providers/MyProvider/client/index'

describe('MyProvider Plugin', () => {
  it('should save activities via context', async () => {
    // Mock PluginContext — all 7 interfaces
    const mockContext: PluginContext = {
      activity: {
        saveActivityWithDetails: vi.fn().mockResolvedValue(undefined),
        saveActivitiesWithDetails: vi.fn().mockResolvedValue(undefined),
        getAllActivities: vi.fn().mockResolvedValue([]),
        getActivity: vi.fn().mockResolvedValue(undefined),
        getDetails: vi.fn().mockResolvedValue(undefined),
        deleteActivity: vi.fn().mockResolvedValue(undefined),
        getUnsyncedActivities: vi.fn().mockResolvedValue([]),
        markAsSynced: vi.fn().mockResolvedValue(undefined)
      },
      storage: {
        getData: vi.fn().mockResolvedValue('mock-api-key'),
        saveData: vi.fn().mockResolvedValue(undefined),
        deleteData: vi.fn().mockResolvedValue(undefined),
        exportDB: vi.fn().mockResolvedValue([]),
        addItemsToStore: vi.fn().mockResolvedValue(undefined)
      },
      notifications: {
        notify: vi.fn()
      },
      plugins: {
        isPluginActive: vi.fn().mockResolvedValue(false),
        enablePlugin: vi.fn().mockResolvedValue(undefined)
      },
      aggregation: {
        getAggregated: vi.fn().mockResolvedValue([]),
        listMetrics: vi.fn().mockReturnValue([])
      },
      friends: {
        publishPublicData: vi.fn().mockResolvedValue(null),
        getMyManifestUrl: vi.fn().mockResolvedValue(null)
      },
      analyzer: {
        create: vi.fn().mockReturnValue({
          bestSegments: vi.fn().mockReturnValue({})
        })
      }
    }

    // Mock external API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: 'Test Activity' }]
    })

    // Test refreshData
    const result = await MyProvider.refreshData(mockContext)

    expect(result.success).toBe(true)
    expect(mockContext.activity.saveActivitiesWithDetails).toHaveBeenCalledTimes(1)
  })
})
```

---

## Migration Guide

### Migrating Existing Plugins

If your plugin currently uses direct service imports, follow these steps:

#### Step 1: Choose the right access pattern

**In Vue components** -- use the composable:

```typescript
import { usePluginContext } from '@/composables/usePluginContext'

// In setup()
const ctx = usePluginContext()
```

**In non-Vue code** (services, managers) -- use the factory:

```typescript
import { getPluginContext } from '@/services/PluginContextFactory'

const ctx = await getPluginContext()
```

#### Step 2: Replace Service Calls

**Before:**

```typescript
import { getActivityService } from '@/services/ActivityService'
import { IndexedDBService } from '@/services/IndexedDBService'

const activityService = await getActivityService()
await activityService.saveActivityWithDetails(activity, details)
const db = await IndexedDBService.getInstance()
const config = await db.getData('myPlugin_config')
```

**After:**

```typescript
const ctx = await getPluginContext()
await ctx.activity.saveActivityWithDetails(activity, details)
const config = await ctx.storage.getData('myPlugin_config')
```

#### Step 3: Replace ToastService Calls

**Before:**

```typescript
import { ToastService } from '@/services/ToastService'
ToastService.push('Import done!', { type: 'success' })
```

**After:**

```typescript
ctx.notifications.notify('Import done!', { type: 'success' })
```

#### Step 4: Remove All Direct Service Imports

**Before:**

```typescript
import { getActivityService } from '@/services/ActivityService'
import { IndexedDBService } from '@/services/IndexedDBService'
import { ToastService } from '@/services/ToastService'
import { DataProviderPluginManager } from '@/services/DataProviderService'
import { FriendService } from '@/services/FriendService'
```

**After:**

```typescript
// In Vue components:
import { usePluginContext } from '@/composables/usePluginContext'

// In non-Vue code:
import { getPluginContext } from '@/services/PluginContextFactory'

// Only import TYPES, never service implementations
import type { Activity, ActivityDetails } from '@/types/activity'
```

---

## Summary

### Quick Checklist

✅ **DO:**

- Use `PluginContext` for all service access
- Store plugin config with prefixed keys (`{pluginId}_`)
- Initialize heavy resources lazily in `setupComponent()`
- Handle errors gracefully (don't crash the app)
- Return status/errors instead of showing UI notifications
- Use atomic operations (`saveActivitiesWithDetails`)

❌ **DON'T:**

- Import services directly (`ActivityDBService`, `IndexedDBService`, etc.)
- Call UI services (`ToastService`) from business logic
- Initialize at module level (use lazy init)
- Access stores directly (use context)
- Import other plugins
- Use non-atomic operations

### Support

Questions or issues? Check:

- [CLAUDE.md](./CLAUDE.md) - Full architecture documentation
- [README.md](./README.md) - Product vision and roadmap
- [GitHub Issues](https://github.com/wanadev/OpenStride/issues)

---

**Last updated:** 2026-02-17 (PluginContext DI complete -- 7 interfaces)

### Réagir à un import de données

```ts
const { providers } = usePluginContext()
const stop = providers.onActivitiesImported(({ providerId, providerLabel }) => {
  // …
})
// à la destruction du composant / du service
stop()
```

N'accédez **jamais** à `DataProviderService` directement. Le plugin de
notifications le faisait, et typait la charge utile de mémoire — un `count` et un
tableau `activities` que l'événement n'a jamais portés, donc `undefined` en
silence. Le contrat (`ProviderImportEvent`) rend cela impossible.

### Faire saisir une valeur chiffrée

```ts
const { units } = usePluginContext()
units.toSI('distance', 50) // 50 km ou 50 mi selon le lecteur → mètres
units.convert('distance', 0).unit // l'unité à afficher à côté du champ
```

Ce qui est stocké est **toujours** en SI, y compris dans un réglage. Voir
`docs/SPORT_AND_UNITS.md` §10 ter.
