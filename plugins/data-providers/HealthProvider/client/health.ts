// Thin wrapper around the `capacitor-health` plugin (mley), which exposes ONE
// unified API for Apple HealthKit (iOS) and Google Health Connect (Android).
//
// The native package is installed only in the CI native builds (not in
// package.json), so we import it dynamically with a variable specifier +
// @vite-ignore — the web PWA build never resolves or bundles it, and these
// functions are only ever called on a native platform.

export interface HealthRouteSample {
  timestamp: string
  lat: number
  lng: number
  alt?: number
}

export interface HealthRateSample {
  timestamp: string
  bpm: number
}

export interface HealthWorkout {
  id: string
  workoutType: string
  sourceName?: string
  startDate: string
  endDate: string
  duration: number // seconds
  distance: number // meters
  calories: number
  route?: HealthRouteSample[]
  heartRate?: HealthRateSample[]
}

interface HealthPlugin {
  isHealthAvailable(): Promise<{ available: boolean }>
  requestHealthPermissions(opts: { permissions: string[] }): Promise<{ permissions: string[] }>
  queryWorkouts(opts: {
    startDate: string
    endDate: string
    includeHeartRate: boolean
    includeRoute: boolean
  }): Promise<{ workouts: HealthWorkout[] }>
}

const PACKAGE = 'capacitor-health'
const PERMISSIONS = ['READ_WORKOUTS', 'READ_ROUTE', 'READ_HEART_RATE']

let cached: HealthPlugin | null = null
async function getPlugin(): Promise<HealthPlugin> {
  if (!cached) {
    const mod = (await import(/* @vite-ignore */ PACKAGE)) as { Health: HealthPlugin }
    cached = mod.Health
  }
  return cached
}

export async function isHealthAvailable(): Promise<boolean> {
  try {
    const health = await getPlugin()
    return (await health.isHealthAvailable()).available
  } catch {
    return false
  }
}

export async function requestHealthPermissions(): Promise<void> {
  const health = await getPlugin()
  await health.requestHealthPermissions({ permissions: PERMISSIONS })
}

/** Fetch workouts (with route + heart rate) between two ISO datetimes. */
export async function queryWorkouts(startISO: string, endISO: string): Promise<HealthWorkout[]> {
  const health = await getPlugin()
  const res = await health.queryWorkouts({
    startDate: startISO,
    endDate: endISO,
    includeHeartRate: true,
    includeRoute: true
  })
  return res.workouts ?? []
}
