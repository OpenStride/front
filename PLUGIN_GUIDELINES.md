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
import type { PluginContext } from '@/types/plugin-context';

export interface PluginContext {
    activity: IActivityService;  // CRUD operations on activities
    storage: IStorageService;    // Settings and plugin-specific data
}
```

### Available Services

#### IActivityService

**Purpose:** Manage activities (create, read, update, delete)

**Methods:**
```typescript
interface IActivityService {
    // Save single activity with details atomically
    saveActivityWithDetails(activity: Activity, details: ActivityDetails): Promise<void>;

    // Batch save (faster for multiple activities)
    saveActivitiesWithDetails(activities: Activity[], details: ActivityDetails[]): Promise<void>;

    // Read operations
    getActivity(id: string): Promise<Activity | undefined>;
    getAllActivities(): Promise<Activity[]>;
    getDetails(id: string): Promise<ActivityDetails | undefined>;

    // Delete (soft delete - sets deleted flag)
    deleteActivity(id: string): Promise<void>;

    // Sync helpers (for storage plugins)
    getUnsyncedActivities(): Promise<Activity[]>;
    markAsSynced(activityIds: string[]): Promise<void>;
}
```

#### IStorageService

**Purpose:** Store plugin-specific settings and configuration

**Methods:**
```typescript
interface IStorageService {
    // Settings store (key-value)
    getData<T>(key: string): Promise<T | undefined>;
    saveData<T>(key: string, data: T): Promise<void>;
    deleteData(key: string): Promise<void>;

    // Advanced: Direct store access (use with caution)
    exportDB(storeName: string): Promise<any[]>;
    addItemsToStore<T>(storeName: string, items: T[], keyFn: (item: T) => any): Promise<void>;
}
```

---

## Allowed Patterns

### ✅ Use PluginContext for Service Access

**Good:**
```typescript
// plugins/data-providers/MyProvider/client/index.ts
import type { ProviderPlugin } from '@/types/provider';
import type { PluginContext } from '@/types/plugin-context';

export default {
    id: 'my-provider',
    label: 'My Provider',

    async refreshData(context: PluginContext) {
        // Use injected context
        const activities = await context.activity.getAllActivities();
        const config = await context.storage.getData('myProviderConfig');

        // ... fetch from external API ...

        await context.activity.saveActivitiesWithDetails(newActivities, newDetails);
    }
} as ProviderPlugin;
```

### ✅ Store Plugin Configuration in Settings

**Good:**
```typescript
// Save plugin-specific config
await context.storage.saveData('myPlugin_apiKey', 'abc123');
await context.storage.saveData('myPlugin_lastSync', Date.now());

// Read config
const apiKey = await context.storage.getData<string>('myPlugin_apiKey');
```

**Naming convention:** Prefix keys with `{pluginId}_` to avoid collisions.

### ✅ Lazy Initialization

**Good:**
```typescript
export default {
    id: 'my-extension',

    async setupComponent() {
        // Initialize heavy resources HERE (when user clicks setup)
        const service = await initializeExternalService();
        return import('./Setup.vue');
    }
} as ExtensionPlugin;
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
import { getActivityDBService } from '@/services/ActivityDBService';
import { IndexedDBService } from '@/services/IndexedDBService';

const activityDB = await getActivityDBService();
await activityDB.saveActivities(activities);  // WRONG!
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
import { ToastService } from '@/services/ToastService';

ToastService.push('Import completed', { type: 'success' });  // WRONG!
```

**Why it's bad:**
- Business logic coupled to UI layer
- Can't test without Vue runtime
- Violates separation of concerns

**Fix:** Return status/errors, let the app show toasts
```typescript
// ✅ CORRECT
async refreshData(context: PluginContext) {
    // ... do work ...
    return { success: true, activitiesImported: 42 };
}
```

### ❌ Module-Level Initialization

**Bad:**
```typescript
// ❌ DON'T DO THIS
import { NotificationService } from './NotificationService';

// Runs immediately when module loads
const service = NotificationService.getInstance();
service.initialize();  // WRONG!

export default {
    id: 'my-plugin',
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
import { IndexedDBService } from '@/services/IndexedDBService';

const db = await IndexedDBService.getInstance();
await db.addItemsToStore('activities', myActivities, (a) => a.id);  // WRONG!
```

**Why it's bad:**
- Bypasses versioning and sync tracking
- Can create data inconsistencies
- No event emission for aggregation

**Fix:** Use `context.activity.saveActivitiesWithDetails()` instead

### ❌ Importing Other Plugins

**Bad:**
```typescript
// ❌ DON'T DO THIS
import { GarminService } from '@plugins/data-providers/GarminProvider/client/GarminService';

const garmin = new GarminService();  // WRONG!
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
import type { ProviderPlugin } from '@/types/provider';
import type { PluginContext } from '@/types/plugin-context';

export default {
    id: 'my-provider',
    label: 'My Provider',
    description: 'Import activities from My Service',
    icon: 'fa-cloud-download',

    setupComponent: () => import('./Setup.vue'),

    async refreshData(context: PluginContext) {
        // 1. Fetch from external API
        const apiKey = await context.storage.getData<string>('myProvider_apiKey');
        const rawActivities = await fetchFromMyAPI(apiKey);

        // 2. Transform to internal format
        const activities = rawActivities.map(transformToActivity);
        const details = rawActivities.map(transformToDetails);

        // 3. Save via context
        await context.activity.saveActivitiesWithDetails(activities, details);

        return { success: true, count: activities.length };
    }
} as ProviderPlugin;
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
import type { StoragePlugin } from '@/types/storage';

export default {
    id: 'my-storage',
    label: 'My Storage',

    setupComponent: () => import('./Setup.vue'),

    async readRemote(store: string): Promise<any[]> {
        const apiKey = await getMyStorageAPIKey();
        return await fetchFromMyStorage(store, apiKey);
    },

    async writeRemote(store: string, data: any[]): Promise<void> {
        const apiKey = await getMyStorageAPIKey();
        await uploadToMyStorage(store, data, apiKey);
    }
} as StoragePlugin;
```

**Note:** Storage plugins currently use direct IndexedDB access for sync operations. This is a known limitation being addressed in Phase 2.

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
import type { ExtensionPlugin } from '@/types/extension';

export default {
    id: 'my-extension',
    label: 'My Extension',

    slots: {
        'activity.top': [
            () => import('./TopBanner.vue')
        ],
        'activity.widgets': [
            () => import('./StatsWidget.vue'),
            () => import('./ChartWidget.vue')
        ]
    }
} as ExtensionPlugin;
```

**Widget component props:**
```vue
<script setup>
import { computed } from 'vue';

const props = defineProps({
    activity: Object,   // Activity summary
    details: Object     // Full activity with samples
});

const avgHeartRate = computed(() => {
    if (!props.details?.samples) return null;
    // ... calculate from samples
});
</script>
```

---

## Examples

### Example 1: Data Provider with Context

```typescript
// plugins/data-providers/StravaProvider/client/index.ts
import type { ProviderPlugin } from '@/types/provider';
import type { PluginContext } from '@/types/plugin-context';
import type { Activity, ActivityDetails } from '@/types/activity';

export default {
    id: 'strava',
    label: 'Strava',
    icon: 'fa-strava',

    setupComponent: () => import('./Setup.vue'),

    async refreshData(context: PluginContext) {
        console.log('[Strava] Fetching activities...');

        // 1. Get OAuth token from settings
        const token = await context.storage.getData<string>('strava_accessToken');
        if (!token) {
            console.warn('[Strava] No access token found');
            return { success: false, error: 'Not authenticated' };
        }

        // 2. Fetch from Strava API
        const response = await fetch('https://www.strava.com/api/v3/athlete/activities', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            return { success: false, error: 'API request failed' };
        }

        const rawActivities = await response.json();

        // 3. Transform to OpenStride format
        const activities: Activity[] = [];
        const details: ActivityDetails[] = [];

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
            });

            // Fetch detailed streams if needed
            const streams = await fetchStravaStreams(raw.id, token);
            details.push(transformStreamsToDetails(raw.id, streams));
        }

        // 4. Save via context (atomic, with versioning)
        await context.activity.saveActivitiesWithDetails(activities, details);

        console.log(`[Strava] Imported ${activities.length} activities`);
        return { success: true, count: activities.length };
    }
} as ProviderPlugin;
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
import { computed } from 'vue';

const props = defineProps({
    activity: Object,
    details: Object
});

const hasPowerData = computed(() => {
    return props.details?.samples?.some(s => s.power != null);
});

const avgPower = computed(() => {
    if (!hasPowerData.value) return null;
    const samples = props.details.samples.filter(s => s.power);
    return Math.round(samples.reduce((sum, s) => sum + s.power, 0) / samples.length);
});

const normalizedPower = computed(() => {
    // Calculate NP using 30s rolling average
    // ... implementation
});

const tss = computed(() => {
    // Calculate TSS based on FTP
    // ... implementation
});
</script>
```

---

## Testing

### Unit Testing Plugins

**Example using Vitest:**

```typescript
// tests/unit/MyProvider.spec.ts
import { describe, it, expect, vi } from 'vitest';
import type { PluginContext } from '@/types/plugin-context';
import MyProvider from '@plugins/data-providers/MyProvider/client/index';

describe('MyProvider Plugin', () => {
    it('should save activities via context', async () => {
        // Mock PluginContext
        const mockContext: PluginContext = {
            activity: {
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
            }
        };

        // Mock external API
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [{ id: 1, name: 'Test Activity' }]
        });

        // Test refreshData
        const result = await MyProvider.refreshData(mockContext);

        expect(result.success).toBe(true);
        expect(mockContext.activity.saveActivitiesWithDetails).toHaveBeenCalledTimes(1);
    });
});
```

---

## Migration Guide

### Migrating Existing Plugins

If your plugin currently uses direct service imports, follow these steps:

#### Step 1: Update Plugin Signature

**Before:**
```typescript
export default {
    id: 'my-plugin',
    async refreshData() {
        const activityDB = await getActivityDBService();
        // ...
    }
}
```

**After:**
```typescript
import type { PluginContext } from '@/types/plugin-context';

export default {
    id: 'my-plugin',
    async refreshData(context: PluginContext) {
        // Use context instead
    }
}
```

#### Step 2: Replace Service Calls

**Before:**
```typescript
import { getActivityDBService } from '@/services/ActivityDBService';
import { IndexedDBService } from '@/services/IndexedDBService';

const activityDB = await getActivityDBService();
await activityDB.saveActivities(activities);
await activityDB.saveDetails(details);
```

**After:**
```typescript
await context.activity.saveActivitiesWithDetails(activities, details);
```

#### Step 3: Replace Settings Access

**Before:**
```typescript
const db = await IndexedDBService.getInstance();
const config = await db.getData('myPlugin_config');
await db.saveData('myPlugin_config', newConfig);
```

**After:**
```typescript
const config = await context.storage.getData('myPlugin_config');
await context.storage.saveData('myPlugin_config', newConfig);
```

#### Step 4: Remove Direct Imports

**Before:**
```typescript
import { getActivityDBService } from '@/services/ActivityDBService';
import { IndexedDBService } from '@/services/IndexedDBService';
import { ToastService } from '@/services/ToastService';
```

**After:**
```typescript
import type { PluginContext } from '@/types/plugin-context';
// Only import types, not services
```

#### Step 5: Update Plugin Manager (if needed)

Plugin managers will be updated to inject `PluginContext` automatically. No changes needed in plugin code.

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

**Last updated:** 2026-01-21 (Refactoring Phase 1)
