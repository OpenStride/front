import { Activity, ActivityDetails, Measurement } from '@/types/activity'
import { mapGarminSport } from './sportTypes'

type RawRecord = Record<string, unknown>

interface GarminRawActivity extends RawRecord {
  summary?: RawRecord
  samples?: RawRecord[]
  laps?: RawRecord[]
  activityId?: string
}

/**
 * Garmin pushes the same activity under two different shapes, and the push
 * buffer can hand us either one first:
 *
 * - **activity summary** — every field flat at the top level, no `samples`.
 *   Sent as soon as the watch syncs.
 * - **activity details** — the same fields nested under `summary`, plus the
 *   `samples` time series. Sent later, once Garmin has processed the FIT file.
 *
 * Reading only `raw.summary` meant a summary push produced an ActivityDetails
 * with no samples *and* no stats, which then overwrote a details push that had
 * already landed: the activity showed up but its map and graphs were empty.
 */
function summaryOf(raw: GarminRawActivity): RawRecord {
  return (raw.summary as RawRecord | undefined) ?? raw
}

/**
 * The activity id, wherever this payload happens to carry it.
 *
 * Summary and details must resolve to the *same* id — they are two halves of
 * one record. The details payload names it at the top level, the summary
 * payload inside the summary object.
 */
function activityIdOf(raw: GarminRawActivity): string | undefined {
  const summary = summaryOf(raw)
  const id = raw.activityId ?? summary.activityId ?? raw.summaryId ?? summary.summaryId
  return id != null ? String(id) : undefined
}

/**
 * True when the payload carries something worth storing as an activity.
 *
 * The push buffer is shared with Garmin's other webhooks (dailies, sleeps…);
 * without this, one of those would be adapted into a `garmin_undefined`
 * activity with no date and no distance.
 */
export function isActivityPayload(raw: unknown): raw is GarminRawActivity {
  if (!raw || typeof raw !== 'object') return false
  const candidate = raw as GarminRawActivity
  if (activityIdOf(candidate) === undefined) return false
  return typeof summaryOf(candidate).startTimeInSeconds === 'number'
}

// Résumé d'activité Garmin → Activity OpenStride
export function adaptGarminSummary(garminDetails: GarminRawActivity): Activity {
  const garmin = summaryOf(garminDetails)

  const samples = garminDetails.samples ?? []
  const polyline: [number, number][] = []
  const step = Math.max(1, Math.floor(samples.length / 50)) // max 50 points
  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i]
    if (s.latitudeInDegree && s.longitudeInDegree) {
      polyline.push([s.latitudeInDegree as number, s.longitudeInDegree as number])
    }
  }
  return {
    id: `garmin_${activityIdOf(garminDetails)}`,
    provider: 'garmin',
    startTime: garmin.startTimeInSeconds as number,
    duration: garmin.durationInSeconds as number,
    distance: garmin.distanceInMeters as number,
    type: mapGarminSport(garmin.activityType),
    title: garmin.activityName as string,
    // Left undefined rather than empty: a summary push has no track, and an
    // empty array would erase the one a details push already stored.
    mapPolyline: polyline.length > 0 ? polyline : undefined,
    version: 1,
    lastModified: Date.now()
  }
}

// Détail Garmin → ActivityDetails OpenStride
export function adaptGarminDetails(garmin: GarminRawActivity): ActivityDetails {
  const summary = summaryOf(garmin)
  const start = (summary.startTimeInSeconds as number) ?? 0
  // const metrics = garmin.activityDetailMetrics?.metrics ?? []
  const samples = garmin.samples?.map((m: RawRecord) => ({
    time: (m.startTimeInSeconds as number) - start,
    distance: m.totalDistanceInMeters as number, // important pour les analyses par km/mètres
    lat: m.latitudeInDegree as number | undefined,
    lng: m.longitudeInDegree as number | undefined,
    elevation: m.elevationInMeters as number | undefined,
    heartRate: m.heartRate as number | undefined,
    cadence: m.stepsPerMinute as number | undefined,
    speed: m.speedMetersPerSecond as number | undefined,
    power: m.powerInWatts as number | undefined,
    // Garmin misspells the JSON key as "Celcius" (sic)
    temperature: m.airTemperatureCelcius as number | undefined
  }))

  // NB: Garmin's pushed activityDetails payload does NOT include laps — they only
  // exist in the separate activity FIT file. So this is usually undefined for push
  // data; kept defensive in case laps are ever present (e.g. FIT-based import).
  const laps = garmin.laps?.map((lap: RawRecord) => ({
    time: (lap.startTimeInSeconds as number) - start,
    duration: (lap.durationInSeconds as number) || 0,
    distance: (lap.totalDistanceInMeters as number) || 0
  }))

  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined

  const measurements: Record<string, Measurement> = {}
  const record = (key: string, value: number | undefined, unit: string) => {
    if (value !== undefined) measurements[key] = { value, unit }
  }

  // Kept apart on purpose: these are three different physical quantities that
  // `stats.averageCadence` below has to flatten into one nameless number.
  record('run.cadence', num(summary.averageRunCadenceInStepsPerMinute), 'spm')
  record('bike.cadence', num(summary.averageBikingCadenceInRevPerMinute), 'rpm')
  record('swim.strokeRate', num(summary.averageSwimCadenceInStrokesPerMinute), 'spm')

  record('swim.poolLength', num(summary.poolLength), 'm')
  record('swim.lengths', num(summary.numberOfActiveLengths), 'count')
  record('swim.strokes', num(summary.totalNumberOfStrokes), 'count')
  record('swim.swolf', num(summary.averageSwolf), 'swolf')

  return {
    id: `garmin_${activityIdOf(garmin)}`,
    samples,
    laps,
    measurements: Object.keys(measurements).length > 0 ? measurements : undefined,
    stats: {
      averageHeartRate: summary.averageHeartRateInBeatsPerMinute as number | undefined,
      maxHeartRate: summary.maxHeartRateInBeatsPerMinute as number | undefined,
      averageSpeed: summary.averageSpeedInMetersPerSecond as number | undefined,
      maxSpeed: summary.maxSpeedInMetersPerSecond as number | undefined,
      // Lossy by nature — the unit is gone once the three collapse into one
      // field. Retained for the widgets that already read it; new code should
      // use the `*.cadence` / `swim.strokeRate` measurements instead.
      averageCadence: (summary.averageRunCadenceInStepsPerMinute ??
        summary.averageBikingCadenceInRevPerMinute ??
        summary.averageSwimCadenceInStrokesPerMinute) as number | undefined,
      totalAscent: summary.totalElevationGainInMeters as number | undefined,
      totalDescent: summary.totalElevationLossInMeters as number | undefined,
      calories: summary.activeKilocalories as number | undefined
    },
    version: 1,
    lastModified: Date.now()
  }
}

/** Incoming values win, but only where the payload actually carries one. */
function mergeDefined<T extends object>(stored: T | undefined, incoming: T | undefined): T {
  if (!stored) return incoming as T
  if (!incoming) return stored
  const out = { ...stored } as Record<string, unknown>
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}

/**
 * Fold a freshly pushed activity into the one already stored.
 *
 * The two pushes describe the same outing, so the second one to arrive must
 * complete the record rather than replace it — whichever order they land in.
 */
export function mergeGarminActivity(stored: Activity | undefined, incoming: Activity): Activity {
  if (!stored) return incoming
  return {
    ...mergeDefined(stored, incoming),
    version: Math.max(stored.version ?? 0, incoming.version ?? 0)
  }
}

/** Same as `mergeGarminActivity`, for the details half of the record. */
export function mergeGarminDetails(
  stored: ActivityDetails | undefined,
  incoming: ActivityDetails
): ActivityDetails {
  if (!stored) return incoming
  return {
    ...mergeDefined(stored, incoming),
    // A summary push carries no time series; keeping the stored one is the
    // whole point of merging instead of putting.
    samples: incoming.samples?.length ? incoming.samples : stored.samples,
    laps: incoming.laps?.length ? incoming.laps : stored.laps,
    measurements: mergeDefined(stored.measurements, incoming.measurements),
    stats: mergeDefined(stored.stats, incoming.stats),
    version: Math.max(stored.version ?? 0, incoming.version ?? 0),
    lastModified: incoming.lastModified
  }
}
