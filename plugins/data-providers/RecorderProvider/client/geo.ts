// Thin wrapper around @capacitor-community/background-geolocation. Keeps tracking
// GPS with the screen off / app backgrounded (via a native foreground service on
// Android and the "Location updates" background mode on iOS).
//
// The plugin is reached through `registerPlugin`, not through an import of its
// package: it ships native code and a `.d.ts`, and **no JavaScript at all**. An
// `import('@capacitor-community/background-geolocation')` therefore resolves to
// nothing in the WebView — which is why the first version of this module could
// never start a watcher. `registerPlugin` asks the native bridge by name, which
// is what the plugin's own README prescribes.
//
// Calling any of this on the web throws (no native implementation registered);
// the provider is native-only (`available()`), so nothing here runs there.

import { registerPlugin } from '@capacitor/core'

export interface GeoPoint {
  lat: number
  lng: number
  alt?: number
  accuracy?: number
  speed?: number // m/s
  time: number // epoch ms
}

/** A failure reported by the watcher, with the plugin's code kept for branching. */
export interface GeoError {
  code?: string
  message: string
}

/** The plugin's code when the user refused (or revoked) the location permission. */
export const NOT_AUTHORIZED = 'NOT_AUTHORIZED'

interface BgLocation {
  latitude: number
  longitude: number
  altitude?: number | null
  accuracy?: number | null
  speed?: number | null
  time?: number | null
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundTitle?: string
      backgroundMessage?: string
      requestPermissions?: boolean
      stale?: boolean
      distanceFilter?: number
    },
    callback: (location?: BgLocation, error?: { code?: string; message?: string }) => void
  ): Promise<string>
  removeWatcher(options: { id: string }): Promise<void>
  openSettings(): Promise<void>
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

/** Metres between two fixes below which the OS does not wake us. */
const DISTANCE_FILTER = 5

/**
 * Start watching position in the background. `onPoint` fires for every fix;
 * `onError` for permission/other failures. Returns a watcher id to stop later.
 *
 * `notification` is the Android foreground-service notification the user reads
 * for the whole recording — it comes from the caller because only the caller
 * has the locale.
 */
export async function startWatch(
  onPoint: (p: GeoPoint) => void,
  onError: (e: GeoError) => void,
  notification: { title: string; message: string }
): Promise<string> {
  return BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: notification.title,
      backgroundMessage: notification.message,
      requestPermissions: true,
      stale: false,
      distanceFilter: DISTANCE_FILTER
    },
    (location, error) => {
      if (error) {
        onError({ code: error.code, message: error.message ?? error.code ?? 'Location error' })
        return
      }
      if (!location) return
      onPoint({
        lat: location.latitude,
        lng: location.longitude,
        alt: location.altitude ?? undefined,
        accuracy: location.accuracy ?? undefined,
        speed: location.speed ?? undefined,
        time: location.time ?? Date.now()
      })
    }
  )
}

export async function stopWatch(id: string): Promise<void> {
  await BackgroundGeolocation.removeWatcher({ id })
}

/**
 * Open the OS location settings for the app. The only way back from a refused
 * permission: the plugin cannot ask a second time once the user has said no.
 */
export async function openLocationSettings(): Promise<void> {
  await BackgroundGeolocation.openSettings()
}
