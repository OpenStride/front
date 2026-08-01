import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { GeoPoint } from '@plugins/data-providers/RecorderProvider/client/geo'

const startWatch = vi.fn()
const stopWatch = vi.fn().mockResolvedValue(undefined)

vi.mock('@plugins/data-providers/RecorderProvider/client/geo', () => ({
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  startWatch: (...args: unknown[]) => startWatch(...args),
  stopWatch: (...args: unknown[]) => stopWatch(...args),
  openLocationSettings: vi.fn()
}))

const store = new Map<string, unknown>()
const saveActivityWithDetails = vi.fn().mockResolvedValue(undefined)

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: async () => ({
    storage: {
      getData: async (k: string) => store.get(k),
      saveData: async (k: string, v: unknown) => void store.set(k, v),
      deleteData: async (k: string) => void store.delete(k)
    },
    activity: { saveActivityWithDetails }
  })
}))

const NOTIF = { title: 'OpenStride', message: 'Recording' }
const T0 = 1_700_000_000_000

function point(seconds: number, metres: number): GeoPoint {
  return { lat: 45 + metres / 111_320, lng: 5, time: T0 + seconds * 1000 }
}

/** The `onPoint` callback the session handed to the watcher. */
function feed(): (p: GeoPoint) => void {
  return startWatch.mock.calls[startWatch.mock.calls.length - 1][0]
}

type SessionModule = typeof import('@plugins/data-providers/RecorderProvider/client/session')

async function loadSession(): Promise<SessionModule> {
  vi.resetModules()
  return import('@plugins/data-providers/RecorderProvider/client/session')
}

describe('recorder session', () => {
  let session: SessionModule
  let watcherSeq = 0

  beforeEach(async () => {
    store.clear()
    startWatch.mockReset()
    stopWatch.mockClear()
    saveActivityWithDetails.mockClear()
    watcherSeq = 0
    startWatch.mockImplementation(async () => `watcher-${++watcherSeq}`)
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    session = await loadSession()
    session.resetForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs exactly one watcher across a pause and a resume', async () => {
    await session.start('running', NOTIF)
    expect(startWatch).toHaveBeenCalledTimes(1)

    await session.pause()
    expect(stopWatch).toHaveBeenCalledWith('watcher-1')

    await session.resume(NOTIF)
    expect(startWatch).toHaveBeenCalledTimes(2)
    expect(session.state.phase).toBe('recording')
  })

  it('keeps recording into the same session when the screen is left and reopened', async () => {
    await session.start('running', NOTIF)
    feed()(point(0, 0))
    feed()(point(10, 30))

    // Leaving the screen only flushes; the watcher stays up.
    await session.flush()
    // Coming back must not start a second watcher nor reset the track.
    await session.restore()

    expect(startWatch).toHaveBeenCalledTimes(1)
    expect(session.state.phase).toBe('recording')
    expect(session.state.session.points).toHaveLength(2)
  })

  it('stops the watcher a reloaded WebView left behind', async () => {
    store.set('recorder:session', {
      watcherId: 'orphan-7',
      session: { sport: 'running', startTime: T0, pauses: [], points: [point(0, 0)] }
    })

    await session.restore()
    expect(stopWatch).toHaveBeenCalledWith('orphan-7')
  })

  it('does not count the time the app was dead as moving time', async () => {
    store.set('recorder:session', {
      watcherId: null,
      session: {
        sport: 'running',
        startTime: T0,
        pauses: [],
        points: [point(0, 0), point(600, 2000)] // last fix 10 min in
      }
    })

    // The app comes back an hour after that last fix.
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 4_200_000)
    await session.restore()

    expect(session.state.phase).toBe('paused')
    const { liveStats } = await import('@plugins/data-providers/RecorderProvider/client/recorder')
    expect(liveStats(session.state.session, Date.now()).duration).toBe(600)
  })

  it('refuses the fixes the filter rejects', async () => {
    await session.start('running', NOTIF)
    feed()(point(0, 0))
    feed()({ ...point(10, 1) }) // stationary wander
    feed()({ ...point(11, 5000) }) // teleport
    feed()({ ...point(20, 60), accuracy: 400 }) // no usable fix
    feed()(point(30, 90)) // a real stride

    expect(session.state.session.points).toHaveLength(2)
  })

  it('saves nothing, and says nothing was recorded, when no fix ever landed', async () => {
    await session.start('running', NOTIF)
    const saved = await session.finish()

    expect(saved).toBeNull()
    expect(saveActivityWithDetails).not.toHaveBeenCalled()
    expect(store.has('recorder:session')).toBe(false)
    expect(session.state.phase).toBe('idle')
  })

  it('saves the activity and clears the recovery copy', async () => {
    await session.start('cycling', NOTIF)
    feed()(point(0, 0))
    feed()(point(60, 300))

    const saved = await session.finish()
    expect(saved?.type).toBe('cycling')
    expect(saveActivityWithDetails).toHaveBeenCalledTimes(1)
    expect(store.has('recorder:session')).toBe(false)
    expect(session.state.phase).toBe('idle')
  })

  it('keeps the recording when the save fails', async () => {
    saveActivityWithDetails.mockRejectedValueOnce(new Error('quota exceeded'))
    await session.start('running', NOTIF)
    feed()(point(0, 0))
    feed()(point(60, 300))

    await expect(session.finish()).rejects.toThrow('quota exceeded')
    expect(session.state.session.points).toHaveLength(2)
    expect(session.state.phase).toBe('paused')
    expect(store.has('recorder:session')).toBe(true)
  })
})
