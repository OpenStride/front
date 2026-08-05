import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------- Mocks ----------

// Mock storage (tokens + sync state)
const mockTokens = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: Date.now() + 3600000,
  refreshTokenExpiresAt: Date.now() + 90 * 24 * 3600000
}
let mockSyncState: Record<string, any> = {}

vi.mock('../../plugins/data-providers/GarminProvider/client/storage', () => ({
  getTokens: vi.fn(() => Promise.resolve(mockTokens)),
  getSyncState: vi.fn(() =>
    Promise.resolve({
      status: 'idle',
      initialImportDone: false,
      lastSyncDate: null,
      lastError: null,
      backfillAskedMonths: [],
      backfillSyncedMonths: [],
      ...mockSyncState
    })
  ),
  updateSyncState: vi.fn((partial: any) => {
    mockSyncState = { ...mockSyncState, ...partial }
    return Promise.resolve()
  })
}))

// Mock garminAuth
vi.mock('../../plugins/data-providers/GarminProvider/client/garminAuth', () => ({
  getValidAccessToken: vi.fn(() => Promise.resolve('test-access-token'))
}))

// Mock env
vi.mock('../../plugins/data-providers/GarminProvider/client/env', () => ({
  default: { proxyUrl: 'https://proxy.test.com' }
}))

// Mock PluginContext — backed by a tiny in-memory store, because the sync
// manager now reads what is already saved before writing over it.
const savedActivities = new Map<string, any>()
const savedDetails = new Map<string, any>()
const mockSaveActivitiesWithDetails = vi.fn((activities: any[], details: any[]) => {
  activities.forEach((a, i) => {
    savedActivities.set(a.id, a)
    savedDetails.set(details[i].id, details[i])
  })
  return Promise.resolve()
})
vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: vi.fn(() =>
    Promise.resolve({
      activity: {
        saveActivitiesWithDetails: mockSaveActivitiesWithDetails,
        getActivity: (id: string) => Promise.resolve(savedActivities.get(id)),
        getDetails: (id: string) => Promise.resolve(savedDetails.get(id))
      }
    })
  )
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import {
  GarminSyncManager,
  syncEmitter
} from '../../plugins/data-providers/GarminProvider/client/GarminSyncManager'
import {
  getTokens,
  updateSyncState
} from '../../plugins/data-providers/GarminProvider/client/storage'

// ---------- Fixtures ----------

/** Garmin raw activity (as delivered via push) */
function garminActivity(i: number) {
  return {
    activityId: `act-${i + 1}`,
    summary: {
      activityId: `act-${i + 1}`,
      startTimeInSeconds: 1700000000 + i * 3600,
      durationInSeconds: 1800 + i * 60,
      distanceInMeters: 5000 + i * 100,
      activityType: 'RUNNING',
      activityName: `Run ${i + 1}`,
      averageHeartRateInBeatsPerMinute: 145,
      maxHeartRateInBeatsPerMinute: 170,
      averageSpeedInMetersPerSecond: 3.5,
      maxSpeedInMetersPerSecond: 4.2
    },
    samples: [
      {
        startTimeInSeconds: 1700000000 + i * 3600,
        totalDistanceInMeters: 0,
        latitudeInDegree: 48.85,
        longitudeInDegree: 2.35,
        elevationInMeters: 50,
        heartRate: 140,
        stepsPerMinute: 170,
        speedMetersPerSecond: 3.3
      }
    ],
    laps: [
      {
        startTimeInSeconds: 1700000000 + i * 3600,
        durationInSeconds: 900,
        totalDistanceInMeters: 2500
      }
    ]
  }
}

/**
 * Garmin's *other* push shape for the same outing: the activity summary, whose
 * fields sit flat at the top level with no `samples` and no `summary` wrapper.
 * It lands as soon as the watch syncs, before the FIT file is processed.
 */
function garminSummaryPush(i: number) {
  const { summary } = garminActivity(i)
  return { ...summary, activeKilocalories: 420 }
}

/** A /push buffer listing: [{ name, data }] where data is a raw Garmin activity */
function pushBuffer(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = garminActivity(i)
    return { name: `garmin_push/u1/activityDetails_${a.activityId}.json`, data: a }
  })
}

/** One /push entry, named the way the proxy names it for that payload type */
function pushEntry(type: 'activities' | 'activityDetails', data: any) {
  return { name: `garmin_push/u1/${type}_${data.activityId}.json`, data }
}

function okJsonResponse(data: any) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data))
  }
}

function errorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body)
  }
}

// ---------- Tests ----------

describe('GarminSyncManager', () => {
  let manager: GarminSyncManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSyncState = {}
    savedActivities.clear()
    savedDetails.clear()
    // Reset singleton
    ;(GarminSyncManager as any).instance = null
    manager = GarminSyncManager.getInstance()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ============================
  // dailyRefresh — reads the owner-scoped push buffer
  // ============================
  describe('dailyRefresh', () => {
    it('reads the owner-scoped push buffer, saves activities, and deletes consumed files', async () => {
      let pushReads = 0
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/push/consume')) return Promise.resolve(okJsonResponse({ deleted: 2 }))
        if (url.endsWith('/push')) {
          pushReads++
          // First read returns the buffer; subsequent reads are empty (drained)
          return Promise.resolve(okJsonResponse(pushReads === 1 ? pushBuffer(2) : []))
        }
        return Promise.resolve(okJsonResponse([]))
      })

      const count = await manager.dailyRefresh()

      expect(count).toBe(2)
      // One save per buffered entry
      expect(mockSaveActivitiesWithDetails).toHaveBeenCalledTimes(2)

      // GET /push carries the Bearer token and never names a userId in the URL
      const getCall = mockFetch.mock.calls.find(c => (c[0] as string).endsWith('/push'))
      expect(getCall).toBeTruthy()
      expect(getCall![0]).toBe('https://proxy.test.com/push')
      expect((getCall![1] as RequestInit).headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer test-access-token' })
      )

      // Consumed files are deleted via authenticated POST /push/consume
      const consumeCall = mockFetch.mock.calls.find(c => (c[0] as string).endsWith('/push/consume'))
      expect(consumeCall).toBeTruthy()
      const consumeOpts = consumeCall![1] as RequestInit
      expect(consumeOpts.method).toBe('POST')
      expect(consumeOpts.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer test-access-token' })
      )
      expect(JSON.parse(consumeOpts.body as string).files).toHaveLength(2)
    })

    it('pulls the last 24 h of details, so a refresh does not wait for the push', async () => {
      // Only the summary has been pushed — the details push has not landed yet.
      let pushReads = 0
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/push/consume')) return Promise.resolve(okJsonResponse({ deleted: 1 }))
        if (url.endsWith('/push')) {
          pushReads++
          return Promise.resolve(
            okJsonResponse(pushReads === 1 ? [pushEntry('activities', garminSummaryPush(0))] : [])
          )
        }
        // …but the pull endpoint already has them
        if (url.includes('/api/activityDetails'))
          return Promise.resolve(okJsonResponse([garminActivity(0)]))
        return Promise.resolve(okJsonResponse([]))
      })

      const count = await manager.dailyRefresh()

      // One outing, whichever route it came in by
      expect(count).toBe(1)
      expect(savedDetails.get('garmin_act-1').samples).toHaveLength(1)

      // Pulled over a window Garmin accepts: 24 h, by upload time
      const pull = mockFetch.mock.calls.find(c => (c[0] as string).includes('/api/activityDetails'))
      expect(pull).toBeTruthy()
      const params = new URLSearchParams((pull![0] as string).split('?')[1])
      const span =
        Number(params.get('uploadEndTimeInSeconds')) -
        Number(params.get('uploadStartTimeInSeconds'))
      expect(span).toBe(24 * 60 * 60)
    })

    it('reports what each source brought, so an empty refresh can be read', async () => {
      let pushReads = 0
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/push/consume')) return Promise.resolve(okJsonResponse({ deleted: 1 }))
        if (url.endsWith('/push')) {
          pushReads++
          return Promise.resolve(okJsonResponse(pushReads === 1 ? pushBuffer(1) : []))
        }
        if (url.includes('/api/activityDetails'))
          return Promise.resolve(errorResponse(403, 'Forbidden: pull not enabled'))
        return Promise.resolve(okJsonResponse([]))
      })

      await manager.dailyRefresh()

      const [report] = (updateSyncState as any).mock.calls
        .map((c: any[]) => c[0].lastRefresh)
        .filter(Boolean)
      expect(report.pushed).toBe(1)
      expect(report.pulled).toBe(0)
      expect(report.pullError).toContain('403')
    })

    it('still saves the push data when the details pull fails', async () => {
      let pushReads = 0
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/push/consume')) return Promise.resolve(okJsonResponse({ deleted: 1 }))
        if (url.endsWith('/push')) {
          pushReads++
          return Promise.resolve(okJsonResponse(pushReads === 1 ? pushBuffer(1) : []))
        }
        if (url.includes('/api/activityDetails'))
          return Promise.resolve(errorResponse(500, 'Garmin is down'))
        return Promise.resolve(okJsonResponse([]))
      })

      const count = await manager.dailyRefresh()

      expect(count).toBe(1)
      expect(savedDetails.get('garmin_act-1').samples).toHaveLength(1)
    })

    it('keeps the samples when a summary push lands after the details push', async () => {
      // Garmin sends the summary first and the details later, but the buffer
      // can hand them over in either order — and the summary carries no track.
      const details = garminActivity(0)
      const buffers = [
        [pushEntry('activityDetails', details)],
        [pushEntry('activities', garminSummaryPush(0))],
        []
      ]
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/push/consume')) return Promise.resolve(okJsonResponse({ deleted: 1 }))
        if (url.endsWith('/push')) return Promise.resolve(okJsonResponse(buffers.shift() ?? []))
        return Promise.resolve(okJsonResponse([]))
      })

      await manager.dailyRefresh() // consumes the details push
      await manager.dailyRefresh() // consumes the summary push

      const stored = savedDetails.get('garmin_act-1')
      expect(stored.samples).toHaveLength(1)
      expect(stored.samples[0].heartRate).toBe(140)
      expect(savedActivities.get('garmin_act-1').mapPolyline).toHaveLength(1)
      // …and the summary-only push still contributes what only it carries
      expect(stored.stats.calories).toBe(420)
    })

    it('reads the stats off a summary-only push', async () => {
      let reads = 0
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/push/consume')) return Promise.resolve(okJsonResponse({ deleted: 1 }))
        if (url.endsWith('/push')) {
          reads++
          return Promise.resolve(
            okJsonResponse(reads === 1 ? [pushEntry('activities', garminSummaryPush(0))] : [])
          )
        }
        return Promise.resolve(okJsonResponse([]))
      })

      const count = await manager.dailyRefresh()

      expect(count).toBe(1)
      const activity = savedActivities.get('garmin_act-1')
      expect(activity.distance).toBe(5000)
      expect(activity.type).toBe('running')
      const details = savedDetails.get('garmin_act-1')
      expect(details.stats.averageHeartRate).toBe(145)
      expect(details.stats.calories).toBe(420)
    })

    it('counts one activity when both of its pushes are in the same batch', async () => {
      let reads = 0
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/push/consume')) return Promise.resolve(okJsonResponse({ deleted: 2 }))
        if (url.endsWith('/push')) {
          reads++
          return Promise.resolve(
            okJsonResponse(
              reads === 1
                ? [
                    pushEntry('activityDetails', garminActivity(0)),
                    pushEntry('activities', garminSummaryPush(0))
                  ]
                : []
            )
          )
        }
        return Promise.resolve(okJsonResponse([]))
      })

      const count = await manager.dailyRefresh()

      expect(count).toBe(1)
      expect(savedDetails.get('garmin_act-1').samples).toHaveLength(1)
    })

    it('ignores a push that is not an activity', async () => {
      let reads = 0
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith('/push/consume')) return Promise.resolve(okJsonResponse({ deleted: 1 }))
        if (url.endsWith('/push')) {
          reads++
          return Promise.resolve(
            okJsonResponse(
              reads === 1 ? [{ name: 'garmin_push/u1/dailies_1.json', data: { steps: 12000 } }] : []
            )
          )
        }
        return Promise.resolve(okJsonResponse([]))
      })

      const count = await manager.dailyRefresh()

      expect(count).toBe(0)
      expect(mockSaveActivitiesWithDetails).not.toHaveBeenCalled()
      // Still consumed, or the buffer would never drain
      expect(mockFetch.mock.calls.some(c => (c[0] as string).endsWith('/push/consume'))).toBe(true)
    })

    it('returns 0 when no tokens are available', async () => {
      ;(getTokens as any).mockResolvedValueOnce(null)

      const count = await manager.dailyRefresh()

      expect(count).toBe(0)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('returns 0 and saves nothing when the buffer is empty', async () => {
      mockFetch.mockResolvedValue(okJsonResponse([]))

      const count = await manager.dailyRefresh()

      expect(count).toBe(0)
      expect(mockSaveActivitiesWithDetails).not.toHaveBeenCalled()
    })

    it('returns 0 and saves nothing on unauthorized buffer read', async () => {
      mockFetch.mockResolvedValue(errorResponse(401, 'Unauthorized'))

      const count = await manager.dailyRefresh()

      expect(count).toBe(0)
      expect(mockSaveActivitiesWithDetails).not.toHaveBeenCalled()
    })

    it('updates sync state after refresh', async () => {
      mockFetch.mockResolvedValue(okJsonResponse([]))

      await manager.dailyRefresh()

      expect(updateSyncState).toHaveBeenCalledWith(
        expect.objectContaining({ lastSyncDate: expect.any(Number) })
      )
    })
  })

  // ============================
  // startInitialImportAsync — guard
  // ============================
  describe('startInitialImportAsync', () => {
    it('skips if initial import is already done', async () => {
      mockSyncState = { initialImportDone: true }

      await manager.startInitialImportAsync()

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('prevents concurrent imports', async () => {
      mockFetch.mockResolvedValue(okJsonResponse([]))

      // Start two imports simultaneously
      const p1 = manager.startInitialImportAsync()
      const p2 = manager.startInitialImportAsync()

      await vi.advanceTimersByTimeAsync(200000)
      await Promise.allSettled([p1, p2])

      // The second one should be skipped (isRunning flag)
      // Both resolve without error
    })

    it('resets stale syncing state', async () => {
      mockSyncState = { status: 'syncing' }
      mockFetch.mockResolvedValue(okJsonResponse([]))

      await manager.startInitialImportAsync()
      await vi.advanceTimersByTimeAsync(200000)

      expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ status: 'idle' }))
    })

    it('emits sync-progress and sync-complete events', async () => {
      mockFetch.mockResolvedValue(okJsonResponse([]))

      const progressEvents: any[] = []
      const completeEvents: any[] = []
      syncEmitter.addEventListener('sync-progress', (e: Event) =>
        progressEvents.push((e as CustomEvent).detail)
      )
      syncEmitter.addEventListener('sync-complete', (e: Event) =>
        completeEvents.push((e as CustomEvent).detail)
      )

      manager.startInitialImportAsync()

      // Advance enough for all 6 months x delays
      await vi.advanceTimersByTimeAsync(600000)

      // Should have received started + progress events
      expect(progressEvents.length).toBeGreaterThanOrEqual(1)
      expect(progressEvents[0].type).toBe('started')

      // Should have completion event
      expect(completeEvents.length).toBeGreaterThanOrEqual(1)
      expect(completeEvents[0]).toHaveProperty('success')
      expect(completeEvents[0]).toHaveProperty('count')
    })
  })

  // ============================
  // getLast6Months (internal but testable via behavior)
  // ============================
  describe('month range calculation', () => {
    it('processes 6 months during initial import', async () => {
      mockFetch.mockResolvedValue(okJsonResponse([]))

      manager.startInitialImportAsync()
      await vi.advanceTimersByTimeAsync(600000)

      // Should fetch for 6 months (each month triggers at least 1 fetch call)
      expect(updateSyncState).toHaveBeenCalled()
    })
  })
})
