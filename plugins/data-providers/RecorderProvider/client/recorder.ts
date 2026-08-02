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

/** Milliseconds of moving time elapsed at wall-clock `atMs`, unrounded. */
export function movingMsAt(session: RecordSession, atMs: number): number {
  return Math.max(0, atMs - session.startTime - pausedMsAt(session, atMs))
}

/**
 * Seconds of moving time elapsed at wall-clock `atMs`. The one time axis of the
 * recording: `activity.duration` and every `sample.time` are read off it, so a
 * pause can no longer leave the last sample sitting past the end of the activity.
 */
export function movingSecondsAt(session: RecordSession, atMs: number): number {
  return Math.round(movingMsAt(session, atMs) / 1000)
}

/**
 * Metres a sample's speed is averaged over.
 *
 * Worth being honest about how little this buys, so nobody widens it expecting
 * miracles. Measured against a simulated 3 m/s run with 3 m of position error
 * per fix, once the pace graph has averaged its 100 m segment — the finest
 * granularity the UI offers — a window of 30 m and a plain Δd/Δt between
 * neighbours are indistinguishable (sd 0.48 against 0.43). The displayed curve
 * does not need it.
 *
 * What does need it is `maxSpeed`, which is a raw per-sample maximum with no
 * segment averaging in front of it: on that same run, neighbours peaked at
 * 10.2 m/s and the window at 7.4 m/s, against a truth of 3. A single pair of
 * fixes that both happen to err outward is enough to file a run with an
 * impossible top speed.
 *
 * Note that the time axis is *not* the reason. With exact positions both
 * methods return the true speed to the last decimal, because the measurement
 * uses raw millisecond timestamps rather than the whole seconds `sample.time`
 * is stored in.
 */
export const SPEED_WINDOW_M = 30

/**
 * Speed at each point, in m/s, measured on the track itself.
 *
 * Not `location.speed`: that is the GPS's instantaneous Doppler estimate at one
 * moment, it is missing entirely on fixes where the OS cannot compute it, and
 * nothing ties it to the distance and duration the activity is summarised from.
 * The consequence was visible — an average pace that read correctly next to a
 * pace graph that did not, because the graph averages `sample.speed` while the
 * summary divides distance by time.
 *
 * Measuring it here from the same distances and the same clock makes the two
 * agree by construction. Time is moving time in **milliseconds**: rounding to
 * the stored second would put a ±30 % error on a two-second interval, and a
 * pause between two fixes would otherwise read as a stop.
 */
export function speedSeries(session: RecordSession, cumulative: number[]): (number | undefined)[] {
  const pts = session.points
  return pts.map((p, i) => {
    if (i === 0) return pts.length > 1 ? undefined : p.speed
    // Walk back to the start of the window, or to the first point.
    let j = i - 1
    while (j > 0 && cumulative[i] - cumulative[j] < SPEED_WINDOW_M) j--
    const metres = cumulative[i] - cumulative[j]
    const seconds = (movingMsAt(session, p.time) - movingMsAt(session, pts[j].time)) / 1000
    if (seconds <= 0) return undefined
    return metres / seconds
  })
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
  const duration = movingSecondsAt(session, nowMs)
  const pace = distance > 0 ? Math.round((duration / distance) * 1000) : 0
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

  // Cumulative distance first: the speed series is measured over it.
  const cumulative: number[] = []
  let running = 0
  pts.forEach((p, i) => {
    if (i > 0) running += haversine(pts[i - 1], p)
    cumulative.push(running)
  })

  const speeds = speedSeries(session, cumulative)
  // The first fix has no window behind it; it borrows the one in front rather
  // than leaving a hole at the start of every graph.
  if (speeds.length > 1 && speeds[0] === undefined) speeds[0] = speeds[1]

  let dist = 0
  const samples: Sample[] = pts.map((p, i) => {
    if (i > 0) dist += haversine(pts[i - 1], p)
    return {
      time: movingSecondsAt(session, p.time),
      distance: Math.round(dist),
      lat: p.lat,
      lng: p.lng,
      elevation: typeof p.alt === 'number' ? p.alt : undefined,
      speed: speeds[i]
    }
  })

  const distance = Math.round(dist)
  const lastPoint = pts[pts.length - 1]
  const duration = lastPoint ? movingSecondsAt(session, lastPoint.time) : 0
  // From the measured series, not from raw GPS: a single Doppler spike used to
  // be enough to file a run with an impossible top speed.
  const measured = speeds.filter((s): s is number => typeof s === 'number')

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
      maxSpeed: measured.length ? Math.max(...measured) : undefined,
      totalAscent: totalAscent(pts) || undefined
    },
    version: 1,
    lastModified: Date.now()
  }

  return { activity, details }
}
