---
name: new-plugin
description: Scaffold a new OpenStride plugin with correct patterns and conventions
argument-hint: '[type] [plugin-id]'
disable-model-invocation: true
---

Scaffold a new OpenStride plugin. If arguments are not provided, ask the following questions:

1. **Plugin type**: data-provider, storage-provider, or app-extension?
2. **Plugin ID**: kebab-case identifier (e.g., strava-provider, s3-storage, power-widget)
3. **Label**: display name (e.g., "Strava", "Amazon S3", "Power Analysis")
4. **Description**: short description

Then generate files based on the type:

### Data Provider

```
plugins/data-providers/{id}/client/index.ts   <- ProviderPlugin with PluginContext
plugins/data-providers/{id}/client/Setup.vue   <- Configuration component
```

### Storage Provider

```
plugins/storage-providers/{id}/client/index.ts <- StoragePlugin with readRemote/writeRemote
plugins/storage-providers/{id}/client/Setup.vue
```

### App Extension

```
plugins/app-extensions/{id}/index.ts           <- ExtensionPlugin with slots
plugins/app-extensions/{id}/Widget.vue         <- Widget with props { activity, details }
```

**Rules for generated code:**

- Use `PluginContext` for all service access (see PLUGIN_GUIDELINES.md)
- `export default` required
- No direct imports of core services
- No ToastService -- return a status object instead
- Lazy initialization in setupComponent()
- Handle missing data gracefully in widgets
- CSS via variables (`var(--color-green-500)`) -- no hardcoded colors
- Font Awesome for icons with `aria-hidden="true"`
