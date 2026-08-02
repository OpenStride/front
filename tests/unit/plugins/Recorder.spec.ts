import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  acceptPoint,
  buildActivity,
  emptySession,
  liveStats,
  movingSecondsAt,
  totalAscent,
  totalDistance,
  MAX_ACCURACY,
  type RecordSession
} from '@plugins/data-providers/RecorderProvider/client/recorder'
import type { GeoPoint } from '@plugins/data-providers/RecorderProvider/client/geo'

const T0 = 1_700_000_000_000

/** A point `seconds` into the run, `metres` north of the start. */
function point(seconds: number, metres: number, extra: Partial<GeoPoint> = {}): GeoPoint {
  return {
    lat: 45 + metres / 111_320,
    lng: 5,
    time: T0 + seconds * 1000,
    ...extra
  }
}

describe('acceptPoint', () => {
  it('refuses a fix whose accuracy says more about the sky than the runner', () => {
    expect(acceptPoint(point(0, 0, { accuracy: MAX_ACCURACY + 1 }))).toBe(false)
    expect(acceptPoint(point(0, 0, { accuracy: MAX_ACCURACY - 1 }))).toBe(true)
  })

  it('takes the first fix even with no predecessor', () => {
    expect(acceptPoint(point(0, 0))).toBe(true)
  })

  it('refuses the wander of a phone standing at a red light', () => {
    expect(acceptPoint(point(10, 1), point(0, 0))).toBe(false)
  })

  it('refuses a teleport that no runner could have covered', () => {
    // 5 km in one second.
    expect(acceptPoint(point(1, 5000), point(0, 0))).toBe(false)
  })

  it('accepts an ordinary stride', () => {
    expect(acceptPoint(point(5, 15), point(0, 0))).toBe(true)
  })
})

describe('totalAscent', () => {
  it('does not turn altitude noise into a climb', () => {
    // A flat run, GPS altitude wobbling by ±2 m around 100 m.
    const flat = [100, 102, 98, 101, 99, 102, 100].map((alt, i) => point(i * 10, i * 20, { alt }))
    expect(totalAscent(flat)).toBe(0)
  })

  it('counts a real climb', () => {
    const climb = [100, 110, 120, 130].map((alt, i) => point(i * 10, i * 20, { alt }))
    expect(totalAscent(climb)).toBe(30)
  })

  it('ignores points with no altitude', () => {
    expect(totalAscent([point(0, 0), point(10, 20)])).toBe(0)
  })
})

describe('liveStats', () => {
  it('stops the clock while the recording is paused', () => {
    const session: RecordSession = {
      ...emptySession('running'),
      startTime: T0,
      pauses: [{ start: T0 + 60_000, end: null }],
      points: [point(0, 0), point(60, 200)]
    }

    // One minute of running, then paused. Ten minutes later, still one minute.
    expect(liveStats(session, T0 + 60_000).duration).toBe(60)
    expect(liveStats(session, T0 + 600_000).duration).toBe(60)
  })

  it('resumes the clock once the pause is closed', () => {
    const session: RecordSession = {
      ...emptySession('running'),
      startTime: T0,
      pauses: [{ start: T0 + 60_000, end: T0 + 300_000 }],
      points: [point(0, 0), point(60, 200)]
    }
    // 6 min of wall clock, 4 min of which were paused.
    expect(liveStats(session, T0 + 360_000).duration).toBe(120)
  })

  it('reports pace from moving time, not wall clock', () => {
    const session: RecordSession = {
      ...emptySession('running'),
      startTime: T0,
      pauses: [{ start: T0 + 300_000, end: T0 + 900_000 }],
      points: [point(0, 0), point(300, 1000)]
    }
    const stats = liveStats(session, T0 + 900_000)
    expect(stats.duration).toBe(300)
    expect(stats.distance).toBeCloseTo(1000, -1)
    expect(stats.pace).toBe(300) // 5'00/km, not 15'00/km
  })
})

describe('buildActivity', () => {
  function pausedSession(): RecordSession {
    return {
      ...emptySession('running'),
      startTime: T0,
      // Ran 5 min, paused 10 min, ran 5 min more.
      pauses: [{ start: T0 + 300_000, end: T0 + 900_000 }],
      points: [point(0, 0), point(300, 1000), point(900, 1000), point(1200, 2000)]
    }
  }

  it('puts the samples on the same time axis as the duration', () => {
    const { activity, details } = buildActivity(pausedSession())
    const samples = details.samples ?? []
    const last = samples[samples.length - 1]

    expect(activity.duration).toBe(600) // 10 min of moving time, not 20
    expect(last.time).toBe(activity.duration)
    // The paused stretch does not advance the axis.
    expect(samples[1].time).toBe(300)
    expect(samples[2].time).toBe(300)
  })

  it('keeps every sample inside the activity', () => {
    const { activity, details } = buildActivity(pausedSession())
    for (const s of details.samples ?? []) expect(s.time).toBeLessThanOrEqual(activity.duration)
  })

  it('derives average speed from moving time', () => {
    const { activity, details } = buildActivity(pausedSession())
    expect(details.stats?.averageSpeed).toBeCloseTo(activity.distance / 600, 5)
  })

  it('ends the drawn track where the user pressed Finish', () => {
    const points = Array.from({ length: 137 }, (_, i) => point(i * 10, i * 20))
    const session: RecordSession = { ...emptySession('cycling'), startTime: T0, points }
    const { activity } = buildActivity(session)
    const line = activity.mapPolyline ?? []

    expect(line.length).toBeGreaterThan(1)
    expect(line[line.length - 1]).toEqual([points[points.length - 1].lat, points[136].lng])
  })

  it('survives a recording with a single fix', () => {
    const session: RecordSession = { ...emptySession(), startTime: T0, points: [point(0, 0)] }
    const { activity } = buildActivity(session)
    expect(activity.distance).toBe(0)
    expect(activity.duration).toBe(0)
  })
})

/**
 * The complaint that produced these: on a real recording the average pace read
 * correctly while the pace graph was nonsense. They came from two unrelated
 * quantities — the summary divides distance by duration, the graph averages
 * `sample.speed`, which used to be the GPS's own instantaneous estimate.
 */
describe('the pace a sample reports agrees with the pace of the activity', () => {
  /** A run at a steady `mps`, fixes every `everyM` metres, as the watcher sees it. */
  function steadyRun(mps: number, everyM: number, metres: number): RecordSession {
    const points: GeoPoint[] = []
    for (let d = 0; d <= metres; d += everyM) {
      // Whatever the device says about speed is deliberately absurd here: the
      // recording must not depend on it.
      points.push(point(d / mps, d, { speed: 99 }))
    }
    return { ...emptySession('running'), startTime: T0, points }
  }

  it('reports the true speed on every sample of a steady run', () => {
    const { activity, details } = buildActivity(steadyRun(3, 5, 1000))
    const samples = details.samples ?? []

    expect(activity.distance / activity.duration).toBeCloseTo(3, 1)
    for (const s of samples) {
      expect(s.speed, `sample at ${s.distance} m`).toBeCloseTo(3, 1)
    }
  })

  it('never repeats what the GPS claimed about speed', () => {
    const { details } = buildActivity(steadyRun(3, 5, 200))
    expect((details.samples ?? []).some(s => s.speed === 99)).toBe(false)
    expect(details.stats?.maxSpeed).toBeLessThan(10)
  })

  it('survives fixes closer together than the stored one-second resolution', () => {
    // 5 m at 3 m/s is 1.67 s — rounded to whole seconds that is a ±30 % error,
    // which is precisely what made neighbouring samples disagree wildly.
    const { details } = buildActivity(steadyRun(3, 5, 300))
    const speeds = (details.samples ?? []).map(s => s.speed ?? 0)
    const spread = Math.max(...speeds) - Math.min(...speeds)
    expect(spread).toBeLessThan(0.5)
  })

  it('does not read a pause as a collapse in speed', () => {
    // Two 200 m halves at 3 m/s with a ten-minute pause in between.
    const points: GeoPoint[] = []
    for (let d = 0; d <= 200; d += 5) points.push(point(d / 3, d))
    for (let d = 205; d <= 400; d += 5) points.push(point(600 + d / 3, d))
    const session: RecordSession = {
      ...emptySession('running'),
      startTime: T0,
      pauses: [{ start: T0 + (200 / 3) * 1000, end: T0 + 600_000 + (200 / 3) * 1000 }],
      points
    }

    const { details } = buildActivity(session)
    for (const s of details.samples ?? []) {
      if (s.speed !== undefined) expect(s.speed, `at ${s.distance} m`).toBeCloseTo(3, 1)
    }
  })

  it('follows a change of pace instead of smoothing it away', () => {
    // 300 m at 4 m/s, then 300 m at 2 m/s.
    const points: GeoPoint[] = []
    for (let d = 0; d <= 300; d += 5) points.push(point(d / 4, d))
    for (let d = 305; d <= 600; d += 5) points.push(point(75 + (d - 300) / 2, d))
    const session: RecordSession = { ...emptySession('running'), startTime: T0, points }

    const samples = buildActivity(session).details.samples ?? []
    // Nearest, not exact: haversine over the synthetic track lands a metre or
    // two off the round numbers the points were laid out on.
    const at = (metres: number) =>
      samples.reduce((best, s) =>
        Math.abs((s.distance ?? 0) - metres) < Math.abs((best.distance ?? 0) - metres) ? s : best
      )
    const fast = at(200)
    const slow = at(500)

    expect(fast?.speed).toBeCloseTo(4, 1)
    expect(slow?.speed).toBeCloseTo(2, 1)
  })
})

describe('movingSecondsAt', () => {
  it('never goes negative for a point before the start', () => {
    const session: RecordSession = { ...emptySession(), startTime: T0, points: [] }
    expect(movingSecondsAt(session, T0 - 5000)).toBe(0)
  })
})

describe('totalDistance', () => {
  it('measures a straight line along a meridian', () => {
    expect(totalDistance([point(0, 0), point(10, 100)])).toBeCloseTo(100, 0)
  })
})

// The MVP reached the plugin with `await import('@capacitor-community/background-
// geolocation')`. That package ships native code and a .d.ts and no JavaScript,
// so the import resolved to nothing in the WebView and no watcher ever started.
// This locks the fix: the bridge is asked for the plugin by name.
describe('geo module', () => {
  const addWatcher = vi.fn().mockResolvedValue('watcher-1')
  const removeWatcher = vi.fn().mockResolvedValue(undefined)
  const openSettings = vi.fn().mockResolvedValue(undefined)
  const registerPlugin = vi.fn(() => ({ addWatcher, removeWatcher, openSettings }))

  beforeEach(() => {
    vi.resetModules()
    vi.doMock('@capacitor/core', () => ({ registerPlugin }))
    registerPlugin.mockClear()
    addWatcher.mockClear()
  })

  it('registers the native plugin by name rather than importing its package', async () => {
    await import('@plugins/data-providers/RecorderProvider/client/geo')
    expect(registerPlugin).toHaveBeenCalledWith('BackgroundGeolocation')
  })

  it('hands the caller notification strings to the watcher', async () => {
    const geo = await import('@plugins/data-providers/RecorderProvider/client/geo')
    const id = await geo.startWatch(
      () => {},
      () => {},
      { title: 'Titre', message: 'Message' }
    )

    expect(id).toBe('watcher-1')
    expect(addWatcher.mock.calls[0][0]).toMatchObject({
      backgroundTitle: 'Titre',
      backgroundMessage: 'Message',
      requestPermissions: true
    })
  })

  it('reports the plugin error code so a refused permission can be told apart', async () => {
    const geo = await import('@plugins/data-providers/RecorderProvider/client/geo')
    const errors: Array<{ code?: string; message: string }> = []
    await geo.startWatch(
      () => {},
      e => errors.push(e),
      { title: 't', message: 'm' }
    )

    const callback = addWatcher.mock.calls[0][1]
    callback(undefined, { code: geo.NOT_AUTHORIZED, message: 'denied' })
    expect(errors).toEqual([{ code: 'NOT_AUTHORIZED', message: 'denied' }])
  })

  it('maps a native fix onto the GeoPoint the recorder speaks', async () => {
    const geo = await import('@plugins/data-providers/RecorderProvider/client/geo')
    const points: unknown[] = []
    await geo.startWatch(
      p => points.push(p),
      () => {},
      { title: 't', message: 'm' }
    )

    const callback = addWatcher.mock.calls[0][1]
    callback({
      latitude: 45.1,
      longitude: 5.2,
      altitude: 210,
      accuracy: 8,
      speed: 3.4,
      time: T0
    })
    expect(points).toEqual([{ lat: 45.1, lng: 5.2, alt: 210, accuracy: 8, speed: 3.4, time: T0 }])
  })
})
