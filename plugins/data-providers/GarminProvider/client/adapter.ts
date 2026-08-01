import { Activity, ActivityDetails, Measurement } from '@/types/activity'
import { mapGarminSport } from './sportTypes'

type RawRecord = Record<string, unknown>

interface GarminRawActivity extends RawRecord {
  summary?: RawRecord
  samples?: RawRecord[]
  laps?: RawRecord[]
  activityId?: string
}

// Résumé d'activité Garmin → Activity OpenStride
export function adaptGarminSummary(garminDetails: GarminRawActivity): Activity {
  const garmin = garminDetails.summary || garminDetails

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
    id: `garmin_${garmin.activityId}`,
    provider: 'garmin',
    startTime: garmin.startTimeInSeconds as number,
    duration: garmin.durationInSeconds as number,
    distance: garmin.distanceInMeters as number,
    type: mapGarminSport(garmin.activityType),
    title: garmin.activityName as string,
    mapPolyline: polyline,
    version: 1,
    lastModified: Date.now()
  }
}

// Détail Garmin → ActivityDetails OpenStride
export function adaptGarminDetails(garmin: GarminRawActivity): ActivityDetails {
  const start = (garmin.summary?.startTimeInSeconds as number) ?? 0
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

  const summary = garmin.summary ?? {}
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
    id: `garmin_${garmin.activityId}`,
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
