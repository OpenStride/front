import type { Activity, ActivityDetails, Sample } from '@/types/activity'
import type { SportType } from '@/types/sport'
import type { GeoPoint } from './geo'

/**
 * A stretch of wall-clock time the user was not moving. `end === null` means the
 * pause is still open — which is what makes the HUD clock actually stop: a
 * single `pausedMs` total only grows when the user resumes, so the previous
 * version kept counting throughout the pause and jumped backwards on resume.
 */
export interface Pause {
  start: number // epoch ms
  end: number | null // epoch ms, null while the pause is open
}

/** An in-progress (or finished) recording. Persisted to survive an app kill. */
export interface RecordSession {
  sport: SportType
  startTime: number // epoch ms
  pauses: Pause[]
  points: GeoPoint[]
}

/** Worse than this (in metres) and a fix says more about the sky than the runner. */
export const MAX_ACCURACY = 50
/** Above this implied speed (m/s ≈ 180 km/h) a fix is a GPS jump, not a sprint. */
export const MAX_SPEED = 50
/** Below this (metres) two fixes are the same spot seen twice through noise. */
export const MIN_MOVE = 3
/** A rise counts as ascent only once it clears the altitude noise floor (metres). */
export const ASCENT_THRESHOLD = 3

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

/**
 * Should this fix join the track?
 *
 * Three ways a fix lies, and all three inflate the distance the user is shown:
 * a poor accuracy figure, a teleport (tunnel exit, cell-tower fallback), and the
 * wander of a phone standing still at a traffic light.
 */
export function acceptPoint(next: GeoPoint, prev?: GeoPoint): boolean {
  if (typeof next.accuracy === 'number' && next.accuracy > MAX_ACCURACY) return false
  if (!prev) return true
  const moved = haversine(prev, next)
  if (moved < MIN_MOVE) return false
  const dt = (next.time - prev.time) / 1000
  if (dt > 0 && moved / dt > MAX_SPEED) return false
  return true
}

/** Total GPS distance in meters. */
export function totalDistance(points: GeoPoint[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i])
  return d
}

/**
 * Positive elevation gain in meters.
 *
 * GPS altitude wanders by several metres from one fix to the next, so summing
 * every rise reported a few hundred metres of climb over a flat 10 km. Only a
 * rise that clears `ASCENT_THRESHOLD` above the last confirmed low is counted.
 */
export function totalAscent(points: GeoPoint[]): number {
  let ascent = 0
  let reference: number | undefined
  for (const p of points) {
    if (typeof p.alt !== 'number') continue
    if (reference === undefined) {
      reference = p.alt
      continue
    }
    if (p.alt >= reference + ASCENT_THRESHOLD) {
      ascent += p.alt - reference
      reference = p.alt
    } else if (p.alt <= reference - ASCENT_THRESHOLD) {
      // Symmetric on the way down too: a reference that follows every dip would
      // let a ±2 m wobble climb 6 m over seven fixes, which is how a flat 10 km
      // came back with a few hundred metres of ascent.
      reference = p.alt
    }
  }
  return Math.round(ascent)
}

/** Milliseconds spent paused up to `nowMs`, open pause included. */
export function pausedMsAt(session: RecordSession, nowMs: number): number {
  let paused = 0
  for (const p of session.pauses) {
    if (p.start >= nowMs) continue
    paused += Math.min(p.end ?? nowMs, nowMs) - p.start
  }
  return Math.max(0, paused)
}

/**
 * Seconds of moving time elapsed at wall-clock `atMs`. The one time axis of the
 * recording: `activity.duration` and every `sample.time` are read off it, so a
 * pause can no longer leave the last sample sitting past the end of the activity.
 */
export function movingSecondsAt(session: RecordSession, atMs: number): number {
  return Math.max(0, Math.round((atMs - session.startTime - pausedMsAt(session, atMs)) / 1000))
}

export interface LiveStats {
  distance: number // meters
  duration: number // seconds (moving time, excludes paused)
  /**
   * Seconds per metre — SI, like every pace in the app, and what
   * `units.format('pace', …)` expects. It used to be seconds per kilometre,
   * which is a metric reading baked into a computation: the HUD printed it
   * behind a hardcoded "/km" and a runner set to imperial recorded their run
   * in units they had asked the app not to use.
   */
  pace: number // seconds per metre (0 if no distance)
  speed: number // m/s (average)
}

/** Live stats for the recording HUD. `nowMs` is the current clock. */
export function liveStats(session: RecordSession, nowMs: number): LiveStats {
  const distance = totalDistance(session.points)
  const duration = movingSecondsAt(session, nowMs)
  const pace = distance > 0 ? duration / distance : 0
  const speed = duration > 0 ? distance / duration : 0
  return { distance, duration, pace, speed }
}

/** An empty session, ready to record. */
export function emptySession(sport: SportType = 'running'): RecordSession {
  return { sport, startTime: 0, pauses: [], points: [] }
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
      time: movingSecondsAt(session, p.time),
      distance: Math.round(dist),
      lat: p.lat,
      lng: p.lng,
      elevation: typeof p.alt === 'number' ? p.alt : undefined,
      speed: typeof p.speed === 'number' ? p.speed : undefined
    }
  })

  const distance = Math.round(dist)
  const lastPoint = pts[pts.length - 1]
  const duration = lastPoint ? movingSecondsAt(session, lastPoint.time) : 0
  const speeds = pts.map(p => p.speed).filter((s): s is number => typeof s === 'number')

  // Roughly 50 points, and always the last one: a track that stops short of
  // where the user pressed Finish reads as a lost end of run.
  const polyline: [number, number][] = []
  const step = Math.max(1, Math.floor(pts.length / 50))
  for (let i = 0; i < pts.length; i += step) polyline.push([pts[i].lat, pts[i].lng])
  if (lastPoint && pts.length > 1) {
    const last = polyline[polyline.length - 1]
    if (!last || last[0] !== lastPoint.lat || last[1] !== lastPoint.lng) {
      polyline.push([lastPoint.lat, lastPoint.lng])
    }
  }

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
