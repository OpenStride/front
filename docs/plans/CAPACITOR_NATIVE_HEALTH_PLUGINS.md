# Plan: Capacitor + HealthKit / Health Connect Plugins

> Status: **In Progress** — Phase 1 started
> Created: 2026-02-18

## Goal

Publish OpenStride as native iOS/Android apps via Capacitor to access HealthKit (iOS) and Health Connect (Android) as data-provider plugins. The PWA remains the primary channel — Capacitor is injected at CI build time only.

## Why

- **iOS**: HealthKit has no web API — native app is the only way
- **Android**: Health Connect native access is more reliable than REST
- **PWA**: remains deployed independently, unaffected

---

## Architecture

```
Repository
  /plugins/data-providers/HealthKitProvider/      -> iOS-only plugin
  /plugins/data-providers/HealthConnectProvider/   -> Android-only plugin
  /ci/                                             -> Capacitor configs & native patches
  /.github/workflows/deploy-ios.yml                -> CI: build + TestFlight
  /.github/workflows/deploy-android.yml            -> CI: build + Play Store

Runtime
  PWA (web)       -> plugins hidden (available() returns false)
  iOS app         -> HealthKitProvider visible
  Android app     -> HealthConnectProvider visible
```

### Key decisions

1. **HealthKit and HealthConnect are standard data-provider plugins** — they follow the existing pattern in `plugins/data-providers/`, are auto-discovered via `import.meta.glob`, and use `PluginContext` for DI.

2. **Conditional visibility via `available()` on `ProviderPlugin`** — plugins declare when they should appear. No `v-if` in views, no special-case code. The registry filters them out automatically.

3. **`@capacitor/core` is a project dependency** — it's ~5KB gzipped, tree-shakable, and needed at runtime for `Capacitor.isNativePlatform()`. On web, it returns `false` and native imports are never loaded.

4. **Native Capacitor packages are CI-only** — `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`, and health plugins are installed in CI workflows, not in `package.json`.

5. **macOS runners are free** for public repos on GitHub Actions.

---

## Phase 1 — Plugin infrastructure (code changes)

### 1.1 Add `available?` field to `ProviderPlugin` interface

**File:** `src/types/provider.ts`

```typescript
export interface ProviderPlugin {
  id: string
  label: string
  icon?: string
  description?: string
  setupComponent: () => Promise<any>
  refreshData?: () => Promise<any>
  available?: () => boolean   // NEW — if absent, plugin is always available
  context?: PluginContext
}
```

### 1.2 Filter plugins by availability in registry

**File:** `src/services/ProviderPluginRegistry.ts`

```typescript
export const allProviderPlugins: ProviderPlugin[] = Object.values(modules)
  .map(mod => mod.default)
  .filter(p => !p.available || p.available())
```

### 1.3 Add `@capacitor/core` as dependency

```bash
npm install @capacitor/core
```

### 1.4 Scaffold HealthKit plugin

```
plugins/data-providers/HealthKitProvider/
  client/
    index.ts              # Plugin definition with available() check
    HealthKitSetup.vue    # Setup UI component
    healthkit.ts          # HealthKit data fetching service
```

### 1.5 Scaffold HealthConnect plugin

```
plugins/data-providers/HealthConnectProvider/
  client/
    index.ts
    HealthConnectSetup.vue
    healthconnect.ts
```

---

## Phase 2 — CI/CD workflows

### 2.1 Capacitor config

**File:** `ci/capacitor.config.json`

```json
{
  "appId": "app.openstride",
  "appName": "OpenStride",
  "webDir": "dist",
  "plugins": {}
}
```

### 2.2 Android workflow (simpler — ubuntu runner)

**File:** `.github/workflows/deploy-android.yml`

- Trigger: tags `v*` + workflow_dispatch
- Steps: checkout, npm ci, npm run build, install Capacitor + Android + health plugin, cap sync, patch AndroidManifest, sign with keystore, gradlew bundleRelease, upload to Play Store internal track

### 2.3 iOS workflow (macOS runner)

**File:** `.github/workflows/deploy-ios.yml`

- Trigger: tags `v*` + workflow_dispatch
- Steps: checkout, npm ci, npm run build, install Capacitor + iOS + health plugin, cap sync, patch Info.plist + Entitlements, setup signing (certificate + profile), xcodebuild archive, export IPA, upload to TestFlight

### 2.4 GitHub Secrets needed

| Secret | Platform |
|---|---|
| `APPLE_CERTIFICATE_P12` | iOS |
| `APPLE_CERTIFICATE_PASSWORD` | iOS |
| `APPLE_PROVISIONING_PROFILE` | iOS |
| `APPLE_TEAM_ID` | iOS |
| `APP_STORE_CONNECT_API_KEY` | iOS |
| `KEYCHAIN_PASSWORD` | iOS |
| `ANDROID_KEYSTORE` | Android |
| `ANDROID_KEYSTORE_PASSWORD` | Android |
| `ANDROID_KEY_ALIAS` | Android |
| `ANDROID_KEY_PASSWORD` | Android |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | Android |

---

## Phase 3 — Native health plugin selection

### Options to evaluate

| Package | HealthKit | Health Connect | GPS routes | HR samples | Maturity |
|---|---|---|---|---|---|
| `@capawesome/capacitor-health` | Yes | Yes | TBD | TBD | Recent |
| `capacitor-health-connect` | No | Yes | TBD | TBD | Community |
| Custom Capacitor plugin | Full control | Full control | Yes | Yes | DIY |

Decision deferred until Phase 1 is complete and we can test locally.

---

## Costs

| Item | Cost |
|---|---|
| Apple Developer Program | 99 EUR/year |
| Google Play Developer | 25 USD one-time |
| GitHub Actions (public repo) | Free |
| PWA hosting | Unchanged |

---

## Open questions

- [ ] Which Capacitor health plugin to use? (needs testing with GPS routes + HR samples)
- [ ] App Store review: any concerns with WebView-based apps?
- [ ] Privacy policy requirements for HealthKit
- [ ] Version numbering strategy: shared with PWA or independent?
