import { Activity, ActivityDetails } from '@/types/activity'

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
    type: (garmin.activityType as string)?.toLowerCase() || 'unknown',
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
    speed: m.speedMetersPerSecond as number | undefined
  }))

  const laps = garmin.laps?.map((lap: RawRecord) => ({
    time: (lap.startTimeInSeconds as number) - start,
    duration: (lap.durationInSeconds as number) || 0,
    distance: (lap.totalDistanceInMeters as number) || 0
  }))

  return {
    id: `garmin_${garmin.activityId}`,
    samples,
    laps,
    stats: {
      averageHeartRate: garmin.summary?.averageHeartRateInBeatsPerMinute as number | undefined,
      maxHeartRate: garmin.summary?.maxHeartRateInBeatsPerMinute as number | undefined,
      averageSpeed: garmin.summary?.averageSpeedInMetersPerSecond as number | undefined,
      maxSpeed: garmin.summary?.maxSpeedInMetersPerSecond as number | undefined,
      averageCadence: garmin.summary?.averageRunCadenceInStepsPerMinute as number | undefined,
      totalAscent: garmin.summary?.totalElevationGainInMeters as number | undefined,
      calories: garmin.summary?.activeKilocalories as number | undefined
    },
    version: 1,
    lastModified: Date.now()
  }
}
