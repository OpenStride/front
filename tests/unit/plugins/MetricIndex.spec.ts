import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Activity, ActivityDetails } from '@/types/activity'
import type { ActivityMetricsRow } from '@/composables/useActivityMetricsIndex'

const mocks = vi.hoisted(() => ({
  getPluginContext: vi.fn()
}))

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: mocks.getPluginContext
}))

const { useActivityMetricsIndex } = await import('@/composables/useActivityMetricsIndex')

const INDEX_VERSION = 1

function makeActivity(id: string): Activity {
  return {
    id,
    startTime: new Date('2026-03-02T08:00:00Z').getTime(),
    distance: 10000,
    duration: 3000,
    type: 'Running',
    provider: 'test',
    version: 1,
    lastModified: 1
  } as Activity
}

function makeDetails(id: string): ActivityDetails {
  return {
    id,
    samples: [
      { time: 0, distance: 0 },
      { time: 1500, distance: 5000 }
    ],
    laps: [],
    version: 1,
    lastModified: 1
  } as unknown as ActivityDetails
}

let storedRows: ActivityMetricsRow[]
let addItemsToStore: ReturnType<typeof vi.fn>
let getDetails: ReturnType<typeof vi.fn>
let bestSegments: ReturnType<typeof vi.fn>

/** Every target comes back at a plausible 5 min/km unless overridden */
function defaultSegments(targets: number[]) {
  const out: Record<number, { sample: unknown; duration: number }> = {}
  for (const meters of targets) {
    out[meters] = { sample: {}, duration: meters * 0.3 }
  }
  return out
}

function setupContext() {
  storedRows = []
  addItemsToStore = vi.fn(async (_store: string, rows: ActivityMetricsRow[]) => {
    storedRows.push(...rows)
  })
  getDetails = vi.fn(async (id: string) => makeDetails(id))
  bestSegments = vi.fn(defaultSegments)

  mocks.getPluginContext.mockResolvedValue({
    storage: {
      exportDB: vi.fn(async (store: string) =>
        store === 'activity_metrics' ? storedRows : ([] as ActivityDetails[])
      ),
      addItemsToStore
    },
    activity: { getDetails },
    analyzer: { create: () => ({ bestSegments }) }
  })
}

describe('useActivityMetricsIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupContext()
  })

  it('indexes every activity on a cold start and exposes the values', async () => {
    const { ensureIndex, derived } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a'), makeActivity('b')])

    expect(getDetails).toHaveBeenCalledTimes(2)
    expect(addItemsToStore).toHaveBeenCalledTimes(1)
    expect(addItemsToStore.mock.calls[0][0]).toBe('activity_metrics')
    expect(storedRows).toHaveLength(2)
    expect(derived.value.get('a')?.time_5000).toBe(1500)
  })

  it('stores the index version and the sport alongside the values', async () => {
    const { ensureIndex } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    expect(storedRows[0]).toMatchObject({
      id: 'a',
      sport: 'running',
      indexVersion: INDEX_VERSION
    })
  })

  it('skips activities that already hold a row of the current version', async () => {
    const { ensureIndex } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    vi.clearAllMocks()
    await ensureIndex([makeActivity('a')])

    expect(getDetails).not.toHaveBeenCalled()
    expect(addItemsToStore).not.toHaveBeenCalled()
  })

  it('only computes the activities missing from the index', async () => {
    const { ensureIndex } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    vi.clearAllMocks()
    await ensureIndex([makeActivity('a'), makeActivity('b')])

    expect(getDetails).toHaveBeenCalledTimes(1)
    expect(getDetails).toHaveBeenCalledWith('b')
  })

  it('recomputes a row built by an older index version', async () => {
    storedRows = [
      { id: 'a', startTime: 1, sport: 'running', indexVersion: 0, values: { time_5000: 9999 } }
    ]

    const { ensureIndex, derived } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    expect(getDetails).toHaveBeenCalledWith('a')
    expect(derived.value.get('a')?.time_5000).toBe(1500)
  })

  it('discards a segment whose speed is physically impossible', async () => {
    // 5 km in 100 s is 180 km/h — a GPS glitch, not a personal best
    bestSegments.mockImplementation((targets: number[]) => {
      const out = defaultSegments(targets)
      out[5000] = { sample: {}, duration: 100 }
      return out
    })

    const { ensureIndex, derived } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    expect(derived.value.get('a')?.time_5000).toBeUndefined()
    expect(derived.value.get('a')?.time_10000).toBe(3000)
  })

  it('still writes a row for an activity with no usable details', async () => {
    getDetails.mockResolvedValue(undefined)

    const { ensureIndex } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    expect(storedRows).toHaveLength(1)
    expect(storedRows[0].values).toEqual({})

    // and does not rescan it on the next visit
    vi.clearAllMocks()
    await ensureIndex([makeActivity('a')])
    expect(getDetails).not.toHaveBeenCalled()
  })

  it('coalesces concurrent rebuilds into a single pass', async () => {
    const { ensureIndex } = useActivityMetricsIndex()
    const activities = [makeActivity('a'), makeActivity('b')]

    await Promise.all([ensureIndex(activities), ensureIndex(activities), ensureIndex(activities)])

    expect(addItemsToStore).toHaveBeenCalledTimes(1)
    expect(storedRows).toHaveLength(2)
  })
})
