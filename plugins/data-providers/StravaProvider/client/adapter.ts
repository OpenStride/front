import type { Activity, ActivityDetails, Sample } from '@/types/activity'
import { mapStravaSport } from './sportTypes'
import type { ParsedTrack } from './parseTrack'

// Strava export activities.csv row (only the columns we use; header names as
// they appear in the export).
export interface StravaCsvRow {
  'Activity ID'?: string
  'Activity Date'?: string
  'Activity Name'?: string
  'Activity Type'?: string
  'Elapsed Time'?: string
  'Moving Time'?: string
  Distance?: string
  'Max Heart Rate'?: string
  'Average Heart Rate'?: string
  'Max Speed'?: string
  'Average Speed'?: string
  'Average Cadence'?: string
  'Average Watts'?: string
  'Elevation Gain'?: string
  Calories?: string
  Filename?: string
  [key: string]: string | undefined
}

const n = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined
  const x = Number(v)
  return isNaN(x) ? undefined : x
}

/** Strava "Activity Date" (e.g. "Aug 1, 2024, 6:12:00 AM") → epoch seconds. */
function csvDateToEpoch(date?: string): number {
  if (!date) return 0
  const t = Date.parse(date)
  return isNaN(t) ? 0 : Math.floor(t / 1000)
}

/** Reduced [lat,lng] polyline (max ~50 points) from track samples. */
function buildPolyline(samples: Sample[]): [number, number][] {
  const pts = samples.filter(s => typeof s.lat === 'number' && typeof s.lng === 'number')
  if (pts.length === 0) return []
  const step = Math.max(1, Math.floor(pts.length / 50))
  const out: [number, number][] = []
  for (let i = 0; i < pts.length; i += step) out.push([pts[i].lat as number, pts[i].lng as number])
  return out
}

/**
 * Strava export activity (CSV row + optional parsed track file) → OpenStride
 * Activity + ActivityDetails. Track-file values are preferred (accurate);
 * the CSV is the fallback, and the only source for manual activities with no file.
 */
export function adaptStravaExport(
  row: StravaCsvRow,
  track: ParsedTrack | null
): { activity: Activity; details: ActivityDetails } {
  const id = `strava_${row['Activity ID']}`
  const samples = track?.samples ?? []
  const s = track?.summary

  const startTime = s?.startTime ?? csvDateToEpoch(row['Activity Date'])
  const duration = s?.duration ?? n(row['Elapsed Time']) ?? n(row['Moving Time']) ?? 0
  // CSV Distance is in km; track distance is already in meters.
  const distance = s?.distance ?? (n(row.Distance) !== undefined ? n(row.Distance)! * 1000 : 0)

  const activity: Activity = {
    id,
    provider: 'strava',
    startTime,
    duration,
    distance,
    type: mapStravaSport(row['Activity Type']),
    title: row['Activity Name'] || undefined,
    mapPolyline: buildPolyline(samples),
    version: 1,
    lastModified: Date.now()
  }

  const details: ActivityDetails = {
    id,
    samples,
    laps: track?.laps && track.laps.length > 0 ? track.laps : undefined,
    stats: {
      averageHeartRate: s?.averageHeartRate ?? n(row['Average Heart Rate']),
      maxHeartRate: s?.maxHeartRate ?? n(row['Max Heart Rate']),
      averageSpeed: s?.averageSpeed ?? n(row['Average Speed']),
      maxSpeed: s?.maxSpeed ?? n(row['Max Speed']),
      averageCadence: s?.averageCadence ?? n(row['Average Cadence']),
      totalAscent: s?.totalAscent ?? n(row['Elevation Gain']),
      calories: s?.calories ?? n(row.Calories)
    },
    version: 1,
    lastModified: Date.now()
  }

  return { activity, details }
}
