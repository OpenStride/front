import { Activity, ActivityDetails, Sample } from '@/types/activity'
import { mapStravaSport } from './sportTypes'

type RawRecord = Record<string, unknown>

/** Strava activity summary (subset of fields we use). */
export interface StravaActivity extends RawRecord {
  id: number
  name?: string
  sport_type?: string
  type?: string
  distance?: number
  moving_time?: number
  elapsed_time?: number
  start_date?: string
  total_elevation_gain?: number
  average_speed?: number
  max_speed?: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  calories?: number
}

/** Strava streams keyed by type (key_by_type=true): { heartrate: { data: [...] }, ... } */
export type StravaStreams = Record<string, { data?: unknown[] }> | undefined

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

function startSeconds(activity: StravaActivity): number {
  return activity.start_date ? Math.floor(Date.parse(activity.start_date) / 1000) : 0
}

/** Build a reduced [lat,lng] polyline from the latlng stream (max ~50 points). */
function buildPolyline(streams: StravaStreams): [number, number][] {
  const latlng = streams?.latlng?.data as [number, number][] | undefined
  if (!latlng || latlng.length === 0) return []
  const polyline: [number, number][] = []
  const step = Math.max(1, Math.floor(latlng.length / 50))
  for (let i = 0; i < latlng.length; i += step) {
    const p = latlng[i]
    if (Array.isArray(p) && p.length === 2) polyline.push([p[0], p[1]])
  }
  return polyline
}

/** Strava activity → OpenStride Activity summary. */
export function adaptStravaSummary(activity: StravaActivity, streams: StravaStreams): Activity {
  return {
    id: `strava_${activity.id}`,
    provider: 'strava',
    startTime: startSeconds(activity),
    duration: (activity.elapsed_time ?? activity.moving_time ?? 0) as number,
    distance: (activity.distance ?? 0) as number,
    type: mapStravaSport(activity.sport_type ?? activity.type),
    title: activity.name,
    mapPolyline: buildPolyline(streams),
    version: 1,
    lastModified: Date.now()
  }
}

/** Strava activity + streams → OpenStride ActivityDetails. */
export function adaptStravaDetails(activity: StravaActivity, streams: StravaStreams): ActivityDetails {
  const time = (streams?.time?.data as number[] | undefined) ?? []
  const distance = (streams?.distance?.data as number[] | undefined) ?? []
  const latlng = (streams?.latlng?.data as [number, number][] | undefined) ?? []
  const altitude = (streams?.altitude?.data as number[] | undefined) ?? []
  const heartrate = (streams?.heartrate?.data as number[] | undefined) ?? []
  const cadence = (streams?.cadence?.data as number[] | undefined) ?? []
  const watts = (streams?.watts?.data as number[] | undefined) ?? []
  const velocity = (streams?.velocity_smooth?.data as number[] | undefined) ?? []
  const temp = (streams?.temp?.data as number[] | undefined) ?? []

  const samples: Sample[] = time.map((t, i) => ({
    time: t,
    distance: num(distance[i]),
    lat: latlng[i]?.[0],
    lng: latlng[i]?.[1],
    elevation: num(altitude[i]),
    heartRate: num(heartrate[i]),
    cadence: num(cadence[i]),
    speed: num(velocity[i]),
    power: num(watts[i]),
    temperature: num(temp[i])
  }))

  return {
    id: `strava_${activity.id}`,
    samples,
    // Strava laps require a separate detailed-activity fetch; omitted in the pull scaffold.
    laps: undefined,
    stats: {
      averageHeartRate: num(activity.average_heartrate),
      maxHeartRate: num(activity.max_heartrate),
      averageSpeed: num(activity.average_speed),
      maxSpeed: num(activity.max_speed),
      averageCadence: num(activity.average_cadence),
      totalAscent: num(activity.total_elevation_gain),
      calories: num(activity.calories)
    },
    version: 1,
    lastModified: Date.now()
  }
}
