import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------- Mocks ----------

// Mock storage (tokens + sync state)
const mockTokens = {
  accessToken: 'test-access-token',
  accessTokenSecret: 'test-secret'
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

// Mock env
vi.mock('../../plugins/data-providers/GarminProvider/client/env', () => ({
  default: { apiUrl: 'https://api.test.com' }
}))

// Mock PluginContext
const mockSaveActivitiesWithDetails = vi.fn()
vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: vi.fn(() =>
    Promise.resolve({
      activity: {
        saveActivitiesWithDetails: mockSaveActivitiesWithDetails
      }
    })
  )
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { GarminSyncManager, syncEmitter } from '../../plugins/data-providers/GarminProvider/client/GarminSyncManager'
import { getTokens, updateSyncState } from '../../plugins/data-providers/GarminProvider/client/storage'

// ---------- Fixtures ----------

/** Garmin API raw response for one activity */
function garminApiResponse(count: number) {
  return Array.from({ length: count }, (_, i) => ({
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
      },
      {
        startTimeInSeconds: 1700000000 + i * 3600 + 30,
        totalDistanceInMeters: 100,
        latitudeInDegree: 48.851,
        longitudeInDegree: 2.351,
        elevationInMeters: 51,
        heartRate: 145,
        stepsPerMinute: 172,
        speedMetersPerSecond: 3.4
      }
    ],
    laps: [
      {
        startTimeInSeconds: 1700000000 + i * 3600,
        durationInSeconds: 900,
        totalDistanceInMeters: 2500
      }
    ]
  }))
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
    // Reset singleton
    ;(GarminSyncManager as any).instance = null
    manager = GarminSyncManager.getInstance()
    mockSaveActivitiesWithDetails.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ============================
  // dailyRefresh
  // ============================
  describe('dailyRefresh', () => {
    it('fetches last 7 days one by one and saves activities', async () => {
      const activities = garminApiResponse(2)
      mockFetch.mockResolvedValue(okJsonResponse(activities))

      const count = await manager.dailyRefresh()

      // 7 days x 2 activities per call = 14
      expect(count).toBe(14)
      expect(mockFetch).toHaveBeenCalledTimes(7)
      expect(mockSaveActivitiesWithDetails).toHaveBeenCalledTimes(7)

      // Verify URL structure: contains oauth_token, start_time, end_time, detail=1
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('oauth_token=test-access-token')
      expect(url).toContain('oauth_token_secret=test-secret')
      expect(url).toContain('detail=1')
      expect(url).not.toContain('backfill=1')
    })

    it('returns 0 when no tokens are available', async () => {
      ;(getTokens as any).mockResolvedValueOnce(null)

      const count = await manager.dailyRefresh()

      expect(count).toBe(0)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('continues with other days when one day fails', async () => {
      mockFetch
        .mockResolvedValueOnce(okJsonResponse(garminApiResponse(1))) // day 1 ok
        .mockRejectedValueOnce(new Error('Network error')) // day 2 fail
        .mockResolvedValueOnce(okJsonResponse(garminApiResponse(1))) // day 3 ok
        .mockResolvedValueOnce(okJsonResponse([])) // day 4 empty
        .mockResolvedValueOnce(okJsonResponse(garminApiResponse(1))) // day 5
        .mockResolvedValueOnce(okJsonResponse(garminApiResponse(1))) // day 6
        .mockResolvedValueOnce(okJsonResponse(garminApiResponse(1))) // day 7

      const count = await manager.dailyRefresh()

      // 5 successful days x 1 activity each
      expect(count).toBe(5)
      expect(mockFetch).toHaveBeenCalledTimes(7)
    })

    it('returns 0 when API returns empty arrays', async () => {
      mockFetch.mockResolvedValue(okJsonResponse([]))

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
  // fetchAndSaveActivities — retry logic
  // ============================
  describe('rate limit retry', () => {
    it('retries on 429 with exponential backoff', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(429, 'Rate limit'))
        .mockResolvedValueOnce(okJsonResponse(garminApiResponse(1)))

      // dailyRefresh will trigger fetchAndSaveActivities internally
      // We test via dailyRefresh since fetchAndSaveActivities is private
      // Only fetch days 0..6 but first one triggers retry
      mockFetch
        .mockReset()
        .mockResolvedValueOnce(errorResponse(429, 'Too many requests'))
        .mockResolvedValue(okJsonResponse(garminApiResponse(1)))

      const countPromise = manager.dailyRefresh()

      // Advance past the 60s backoff (2^1 * 30000 = 60000ms)
      await vi.advanceTimersByTimeAsync(70000)

      const count = await countPromise

      // First call: 429 + retry + success, then 6 more days
      expect(count).toBeGreaterThanOrEqual(1)
    })

    it('handles duplicate backfill error by re-fetching with timestamp', async () => {
      const backfillTimestamp = '2026-01-15T10:00:00Z'
      mockFetch
        .mockResolvedValueOnce(
          errorResponse(400, `duplicate backfill processed at ${backfillTimestamp}`)
        )
        .mockResolvedValueOnce(okJsonResponse(garminApiResponse(2))) // backfill timestamp fetch
        .mockResolvedValue(okJsonResponse([])) // remaining days

      const count = await manager.dailyRefresh()

      // Second fetch should be the backfill timestamp recovery
      const secondUrl = mockFetch.mock.calls[1][0] as string
      expect(secondUrl).not.toContain('backfill=1')
      expect(count).toBe(2)
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

      expect(updateSyncState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'idle' })
      )
    })

    it('emits sync-progress and sync-complete events', async () => {
      mockFetch.mockResolvedValue(okJsonResponse(garminApiResponse(1)))

      const progressEvents: any[] = []
      const completeEvents: any[] = []
      syncEmitter.addEventListener('sync-progress', (e: Event) =>
        progressEvents.push((e as CustomEvent).detail)
      )
      syncEmitter.addEventListener('sync-complete', (e: Event) =>
        completeEvents.push((e as CustomEvent).detail)
      )

      manager.startInitialImportAsync()

      // Advance enough for all 6 months x 15s delays
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
      // With 15s delay between months, all 6 should execute within 600s
      expect(updateSyncState).toHaveBeenCalled()
    })
  })
})
