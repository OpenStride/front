import type { Activity, ActivityDetails, Sample } from '@/types/activity'
import { mapHealthSport } from './sportTypes'
import type { HealthWorkout, HealthRateSample } from './health'

const epoch = (iso: string): number => {
  const t = Date.parse(iso)
  return isNaN(t) ? 0 : Math.floor(t / 1000)
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Nearest-timestamp HR lookup using a forward-moving cursor (both series are time-sorted). */
function makeHrLookup(hr: HealthRateSample[]) {
  const pts = hr.map(s => ({ t: epoch(s.timestamp), bpm: s.bpm })).sort((x, y) => x.t - y.t)
  let i = 0
  return (t: number): number | undefined => {
    if (pts.length === 0) return undefined
    while (i < pts.length - 1 && pts[i + 1].t <= t) i++
    const cur = pts[i]
    const next = pts[Math.min(i + 1, pts.length - 1)]
    return Math.abs(cur.t - t) <= Math.abs(next.t - t) ? cur.bpm : next.bpm
  }
}

/** Apple Health / Health Connect workout → OpenStride Activity + ActivityDetails. */
export function adaptHealthWorkout(w: HealthWorkout): {
  activity: Activity
  details: ActivityDetails
} {
  const id = `health_${w.id}`
  const start = epoch(w.startDate)
  const route = w.route ?? []
  const hr = w.heartRate ?? []
  const hrAt = makeHrLookup(hr)

  // Prefer the GPS route as the sample timeline; fall back to the HR series
  // (indoor workouts with no GPS).
  let samples: Sample[] = []
  let ascent = 0
  let prevAlt: number | undefined
  let prevPos: [number, number] | undefined
  let dist = 0

  if (route.length > 0) {
    samples = route.map(p => {
      if (prevPos) dist += haversine(prevPos, [p.lat, p.lng])
      prevPos = [p.lat, p.lng]
      if (typeof p.alt === 'number') {
        if (prevAlt !== undefined && p.alt > prevAlt) ascent += p.alt - prevAlt
        prevAlt = p.alt
      }
      const t = epoch(p.timestamp)
      return {
        time: t - start,
        distance: Math.round(dist),
        lat: p.lat,
        lng: p.lng,
        elevation: typeof p.alt === 'number' ? p.alt : undefined,
        heartRate: hrAt(t)
      }
    })
  } else if (hr.length > 0) {
    samples = hr.map(s => ({ time: epoch(s.timestamp) - start, heartRate: s.bpm }))
  }

  const polyline: [number, number][] = []
  const gps = samples.filter(s => typeof s.lat === 'number')
  const step = Math.max(1, Math.floor(gps.length / 50))
  for (let i = 0; i < gps.length; i += step)
    polyline.push([gps[i].lat as number, gps[i].lng as number])

  const bpms = hr.map(s => s.bpm).filter(b => typeof b === 'number')
  const avgHr = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : undefined
  const maxHr = bpms.length ? Math.max(...bpms) : undefined

  const activity: Activity = {
    id,
    provider: 'health',
    startTime: start,
    duration: w.duration || 0,
    distance: w.distance || 0,
    type: mapHealthSport(w.workoutType),
    mapPolyline: polyline,
    version: 1,
    lastModified: Date.now()
  }

  const details: ActivityDetails = {
    id,
    samples,
    stats: {
      averageHeartRate: avgHr,
      maxHeartRate: maxHr,
      averageSpeed: w.duration ? w.distance / w.duration : undefined,
      totalAscent: route.length > 0 ? Math.round(ascent) : undefined,
      calories: w.calories || undefined
    },
    version: 1,
    lastModified: Date.now()
  }

  return { activity, details }
}
