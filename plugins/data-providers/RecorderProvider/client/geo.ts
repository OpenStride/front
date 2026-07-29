// Thin wrapper around @capacitor-community/background-geolocation. Keeps tracking
// GPS with the screen off / app backgrounded (via a native foreground service on
// Android and the "Location updates" background mode on iOS).
//
// The native package is installed only in the native CI build (not package.json),
// so it's imported dynamically with a variable specifier + @vite-ignore — the web
// PWA never resolves it, and these functions only run on a native platform.

export interface GeoPoint {
  lat: number
  lng: number
  alt?: number
  accuracy?: number
  speed?: number // m/s
  time: number // epoch ms
}

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
}

const PACKAGE = '@capacitor-community/background-geolocation'

let plugin: BackgroundGeolocationPlugin | null = null
async function getPlugin(): Promise<BackgroundGeolocationPlugin> {
  if (!plugin) {
    const mod = (await import(/* @vite-ignore */ PACKAGE)) as {
      BackgroundGeolocation?: BackgroundGeolocationPlugin
      default?: BackgroundGeolocationPlugin
    }
    plugin = (mod.BackgroundGeolocation ?? mod.default)!
  }
  return plugin
}

/**
 * Start watching position in the background. `onPoint` fires for every fix;
 * `onError` for permission/other failures. Returns a watcher id to stop later.
 */
export async function startWatch(
  onPoint: (p: GeoPoint) => void,
  onError?: (message: string) => void
): Promise<string> {
  const bg = await getPlugin()
  return bg.addWatcher(
    {
      backgroundTitle: 'OpenStride',
      backgroundMessage: 'Recording your activity',
      requestPermissions: true,
      stale: false,
      distanceFilter: 5 // meters between fixes
    },
    (location, error) => {
      if (error) {
        onError?.(error.message ?? error.code ?? 'Location error')
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
  const bg = await getPlugin()
  await bg.removeWatcher({ id })
}
