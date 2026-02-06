---
description: OpenStride plugin development patterns. Active when working in plugins/, or when mentioning PluginContext, ProviderPlugin, StoragePlugin, ExtensionPlugin.
globs:
  - 'plugins/**/*'
---

# Plugin Development - OpenStride

## Rule #1: Dependency Injection via PluginContext

All plugins access core services via `PluginContext`, NEVER through direct imports.

```typescript
import type { PluginContext } from '@/types/plugin-context'

// context.activity : IActivityService (CRUD, versioning, soft delete)
// context.storage  : IStorageService (settings key-value)
```

## Forbidden Imports in Plugins

```typescript
// FORBIDDEN -- breaks on next refactoring
import { getActivityDBService } from '@/services/ActivityDBService'  // DEPRECATED
import { IndexedDBService } from '@/services/IndexedDBService'       // Direct coupling
import { ToastService } from '@/services/ToastService'               // UI in business logic
import { ... } from '@plugins/data-providers/GarminProvider/...'     // Cross-plugin
```

## Data Provider Pattern

```typescript
// plugins/data-providers/{id}/client/index.ts
import type { ProviderPlugin } from '@/types/provider'
import type { PluginContext } from '@/types/plugin-context'

export default {
  id: 'my-provider',
  label: 'My Provider',
  description: 'Import from My Service',
  icon: 'fa-cloud-download',
  setupComponent: () => import('./Setup.vue'),

  async refreshData(context: PluginContext) {
    const token = await context.storage.getData<string>('myProvider_token')
    if (!token) return { success: false, error: 'Not authenticated' }

    const raw = await fetchFromAPI(token)
    const activities = raw.map(transformToActivity)
    const details = raw.map(transformToDetails)

    await context.activity.saveActivitiesWithDetails(activities, details)
    return { success: true, count: activities.length }
  }
} as ProviderPlugin
```

## Storage Provider Pattern

```typescript
// plugins/storage-providers/{id}/client/index.ts
import type { StoragePlugin } from '@/types/storage'

export default {
  id: 'my-storage',
  label: 'My Storage',
  setupComponent: () => import('./Setup.vue'),
  async readRemote(store: string): Promise<any[]> {
    /* ... */
  },
  async writeRemote(store: string, data: any[]): Promise<void> {
    /* ... */
  }
} as StoragePlugin
```

## App Extension Pattern

```typescript
// plugins/app-extensions/{id}/index.ts  (NO client/ subfolder)
import type { ExtensionPlugin } from '@/types/extension'

export default {
  id: 'my-extension',
  label: 'My Extension',
  slots: {
    'activity.widgets': [() => import('./Widget.vue')]
  }
} as ExtensionPlugin
```

Widget props: `{ activity: Activity, details: ActivityDetails }`

## Quick Checklist

- [ ] `export default` (no named exports)
- [ ] `PluginContext` for all service access
- [ ] Config keys prefixed: `{pluginId}_myConfig`
- [ ] Lazy init in `setupComponent()`
- [ ] Return `{ success, error? }` instead of calling ToastService
- [ ] Handle missing data in widgets (v-if)

Full documentation: `PLUGIN_GUIDELINES.md`
