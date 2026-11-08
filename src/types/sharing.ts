import type { ActivityDetails, Sample } from '@/types/activity'

export type ActivityStats = NonNullable<ActivityDetails['stats']>

/**
 * The charts a reader can let friends see. Each needs a few sample fields, sent
 * downsampled in a per-year file a friend fetches only when opening an outing.
 */
export type SharedChart = 'pace' | 'heartRate' | 'cadence'
export const SHARED_CHARTS: SharedChart[] = ['pace', 'heartRate', 'cadence']

/** What each chart reads from the samples, beyond the time every point keeps. */
// The elevation profile is drawn inside the pace chart, not on its own: shared
// apart, the distance it needs would let the page work the pace out anyway.
export const CHART_FIELDS: Record<SharedChart, (keyof Sample)[]> = {
  pace: ['speed', 'distance', 'elevation'],
  heartRate: ['heartRate'],
  cadence: ['cadence']
}

/**
 * What a public outing carries, beyond its sport, date, distance and duration
 * (which a friend's feed card needs and always gets).
 */
export interface SharingSettings {
  /** The GPS track. */
  map: boolean
  /**
   * Metres of track withheld at each end, so the start and finish — home, most
   * often — do not travel with it. 0 shares the whole track.
   */
  privacyZone: number
  title: boolean
  /** Exact start time; off, the outing is placed at noon of its day. */
  time: boolean
  /** The summary figures: climb, heart rates, calories, max speed, cadence. */
  figures: boolean
  charts: SharedChart[]
  /** The outing's photos, re-encoded without their location. */
  photos: boolean
}

/** As before these settings existed: nothing more than was already published. */
export const DEFAULT_SHARING: SharingSettings = {
  map: true,
  privacyZone: 0,
  title: true,
  time: true,
  figures: false,
  charts: [],
  photos: false
}

/** The choices offered, in metres. */
export const PRIVACY_ZONES = [0, 200, 500, 1000]

/** Settings key. Replicated with the other settings: it is a preference. */
export const SHARING_KEY = 'sharingSettings'

/** The summary figures a friend may see, when `figures` is on. */
export const SHARED_STATS: (keyof ActivityStats)[] = [
  'totalAscent',
  'averageHeartRate',
  'maxHeartRate',
  'calories',
  'maxSpeed',
  'averageCadence',
  'averageSpeed'
]

/** A stored value read back whole, whatever an older version saved. */
export function readSharing(stored: unknown): SharingSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<SharingSettings>
  return {
    map: s.map ?? DEFAULT_SHARING.map,
    privacyZone: PRIVACY_ZONES.includes(s.privacyZone as number)
      ? (s.privacyZone as number)
      : DEFAULT_SHARING.privacyZone,
    title: s.title ?? DEFAULT_SHARING.title,
    time: s.time ?? DEFAULT_SHARING.time,
    figures: s.figures ?? DEFAULT_SHARING.figures,
    charts: Array.isArray(s.charts)
      ? s.charts.filter((c): c is SharedChart => SHARED_CHARTS.includes(c as SharedChart))
      : [],
    photos: s.photos === true
  }
}

/** At most this many points per outing: enough for a chart, light enough to publish. */
export const MAX_SHARED_POINTS = 400

/**
 * The samples a friend receives: one point in N, only the fields the shared
 * charts read, rounded. Never a position — the track travels on its own, under
 * its own switch.
 */
export function shareSamples(samples: Sample[], charts: SharedChart[]): Sample[] {
  if (!charts.length || !samples.length) return []
  const fields = [...new Set(charts.flatMap(c => CHART_FIELDS[c]))]
  const step = Math.max(1, Math.ceil(samples.length / MAX_SHARED_POINTS))
  const out: Sample[] = []
  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i]
    const point: Sample = { time: Math.round(s.time) }
    for (const f of fields) {
      const v = s[f]
      if (typeof v === 'number' && Number.isFinite(v)) {
        ;(point as unknown as Record<string, number>)[f] =
          f === 'speed' ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10
      }
    }
    out.push(point)
  }
  return out
}

/** Metres between two [lat, lng] points (haversine). */
function metresBetween(a: [number, number], b: [number, number]): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * The track without its first and last `zone` metres, measured along it: the
 * part that leads to a door. A track too short to keep anything between the two
 * zones is not shared at all — what would remain would point straight at both.
 */
export function trimTrack(
  track: [number, number][] | undefined,
  zone: number
): [number, number][] | undefined {
  if (!track || track.length < 2 || zone <= 0) return track
  const along: number[] = [0]
  for (let i = 1; i < track.length; i++)
    along.push(along[i - 1] + metresBetween(track[i - 1], track[i]))
  const total = along[along.length - 1]
  if (total <= 2 * zone) return undefined
  const kept = track.filter((_, i) => along[i] >= zone && along[i] <= total - zone)
  return kept.length >= 2 ? kept : undefined
}
