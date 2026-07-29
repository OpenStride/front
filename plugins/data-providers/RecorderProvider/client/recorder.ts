import type { Activity, ActivityDetails, Sample } from '@/types/activity'
import type { SportType } from '@/types/sport'
import type { GeoPoint } from './geo'

/** An in-progress (or finished) recording. Persisted to survive an app kill. */
export interface RecordSession {
  sport: SportType
  startTime: number // epoch ms
  pausedMs: number // total paused time in ms
  points: GeoPoint[]
}

export function haversine(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Total GPS distance in meters. */
export function totalDistance(points: GeoPoint[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i])
  return d
}

/** Positive elevation gain in meters. */
export function totalAscent(points: GeoPoint[]): number {
  let ascent = 0
  let prev: number | undefined
  for (const p of points) {
    if (typeof p.alt === 'number') {
      if (prev !== undefined && p.alt > prev) ascent += p.alt - prev
      prev = p.alt
    }
  }
  return Math.round(ascent)
}

export interface LiveStats {
  distance: number // meters
  duration: number // seconds (moving time, excludes paused)
  pace: number // seconds per km (0 if no distance)
  speed: number // m/s (average)
}

/** Live stats for the recording HUD. `nowMs` is the current clock. */
export function liveStats(session: RecordSession, nowMs: number): LiveStats {
  const distance = totalDistance(session.points)
  const duration = Math.max(0, Math.round((nowMs - session.startTime - session.pausedMs) / 1000))
  const pace = distance > 0 ? Math.round((duration / distance) * 1000) : 0
  const speed = duration > 0 ? distance / duration : 0
  return { distance, duration, pace, speed }
}

/** Build the final Activity + ActivityDetails from a finished session. */
export function buildActivity(session: RecordSession): {
  activity: Activity
  details: ActivityDetails
} {
  const startSec = Math.floor(session.startTime / 1000)
  const pts = session.points
  const id = `recorder_${session.startTime}`

  let dist = 0
  const samples: Sample[] = pts.map((p, i) => {
    if (i > 0) dist += haversine(pts[i - 1], p)
    return {
      time: Math.max(0, Math.round((p.time - session.startTime) / 1000)),
      distance: Math.round(dist),
      lat: p.lat,
      lng: p.lng,
      elevation: typeof p.alt === 'number' ? p.alt : undefined,
      speed: typeof p.speed === 'number' ? p.speed : undefined
    }
  })

  const distance = Math.round(dist)
  const lastPoint = pts[pts.length - 1]
  const duration = lastPoint
    ? Math.max(0, Math.round((lastPoint.time - session.startTime - session.pausedMs) / 1000))
    : 0
  const speeds = pts.map(p => p.speed).filter((s): s is number => typeof s === 'number')

  const polyline: [number, number][] = []
  const step = Math.max(1, Math.floor(pts.length / 50))
  for (let i = 0; i < pts.length; i += step) polyline.push([pts[i].lat, pts[i].lng])

  const activity: Activity = {
    id,
    provider: 'recorder',
    startTime: startSec,
    duration,
    distance,
    type: session.sport,
    mapPolyline: polyline,
    version: 1,
    lastModified: Date.now()
  }

  const details: ActivityDetails = {
    id,
    samples,
    stats: {
      averageSpeed: duration > 0 ? distance / duration : undefined,
      maxSpeed: speeds.length ? Math.max(...speeds) : undefined,
      totalAscent: totalAscent(pts) || undefined
    },
    version: 1,
    lastModified: Date.now()
  }

  return { activity, details }
}
