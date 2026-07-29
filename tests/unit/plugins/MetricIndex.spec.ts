import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Activity, ActivityDetails } from '@/types/activity'
import { INDEX_VERSION, type ActivityMetricsRow } from '@/composables/useActivityMetricsIndex'

const mocks = vi.hoisted(() => ({
  getPluginContext: vi.fn()
}))

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: mocks.getPluginContext
}))

const { useActivityMetricsIndex } = await import('@/composables/useActivityMetricsIndex')

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
let elevationChange: ReturnType<typeof vi.fn>

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
  elevationChange = vi.fn(() => ({ ascent: 640, descent: 610 }))

  mocks.getPluginContext.mockResolvedValue({
    storage: {
      exportDB: vi.fn(async (store: string) =>
        store === 'activity_metrics' ? storedRows : ([] as ActivityDetails[])
      ),
      addItemsToStore
    },
    activity: { getDetails },
    analyzer: { create: () => ({ bestSegments, elevationChange }) }
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

  it('indexes every list, not just the first of a burst', async () => {
    // The feed indexes the page it renders while the tracker asks for the whole
    // history; returning the in-flight promise to the second caller used to drop
    // its activities on the floor.
    const { ensureIndex } = useActivityMetricsIndex()

    await Promise.all([ensureIndex([makeActivity('a')]), ensureIndex([makeActivity('b')])])

    expect(storedRows.map(r => r.id).sort()).toEqual(['a', 'b'])
  })
})

describe('useActivityMetricsIndex — values lifted out of the details', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupContext()
  })

  const withStats = (stats: Record<string, number>) => {
    getDetails.mockImplementation(async (id: string) => ({ ...makeDetails(id), stats }))
    return useActivityMetricsIndex()
  }

  it('lifts the scalars a card cannot reach on its own', async () => {
    // The feed card only ever holds an Activity; these all live in the details.
    const { ensureIndex, derived } = withStats({
      calories: 620,
      maxSpeed: 5.4,
      averageHeartRate: 148,
      maxHeartRate: 181,
      totalAscent: 430,
      totalDescent: 410
    })
    await ensureIndex([makeActivity('a')])

    expect(derived.value.get('a')).toMatchObject({
      calories: 620,
      maxSpeed: 5.4,
      avgHeartRate: 148,
      maxHeartRate: 181,
      ascent: 430,
      descent: 410
    })
  })

  it('keeps them in SI, never in the reader units', async () => {
    // A converted value in a derived cache would make the cache depend on a
    // display preference — the invariant the records section already broke once.
    const { ensureIndex, derived } = withStats({ maxSpeed: 5.4, totalAscent: 430 })
    await ensureIndex([makeActivity('a')])

    const values = derived.value.get('a')!
    expect(values.maxSpeed).toBe(5.4) // m/s, not 19.4 km/h
    expect(values.ascent).toBe(430) // m, not 1411 ft
  })

  it('recovers the climb from the samples when the provider reported none', async () => {
    getDetails.mockImplementation(async (id: string) => ({
      ...makeDetails(id),
      samples: [
        { time: 0, distance: 0, elevation: 1200 },
        { time: 1500, distance: 5000, elevation: 1840 }
      ],
      stats: { calories: 300 }
    }))

    const { ensureIndex, derived } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    expect(derived.value.get('a')).toMatchObject({ ascent: 640, descent: 610 })
  })

  it('does not record a computed zero, which only means "nothing measured"', async () => {
    // A climb that never comes back down. A reported 0 is the provider saying
    // the ground was flat; a computed 0 says the trace stayed under the noise
    // floor — the detail page already drops that rather than print "0 m".
    elevationChange.mockReturnValue({ ascent: 590, descent: 0 })
    getDetails.mockImplementation(async (id: string) => ({
      ...makeDetails(id),
      samples: [
        { time: 0, distance: 0, elevation: 900 },
        { time: 1500, distance: 5000, elevation: 1490 }
      ],
      stats: {}
    }))

    const { ensureIndex, derived } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    expect(derived.value.get('a')?.ascent).toBe(590)
    expect(derived.value.get('a')?.descent).toBeUndefined()
  })

  it('keeps a descent the provider actually reported as zero', async () => {
    const { ensureIndex, derived } = withStats({ totalAscent: 590, totalDescent: 0 })
    await ensureIndex([makeActivity('a')])

    expect(derived.value.get('a')?.descent).toBe(0)
  })

  it('prefers the reported climb over the computed one', async () => {
    getDetails.mockImplementation(async (id: string) => ({
      ...makeDetails(id),
      samples: [
        { time: 0, distance: 0, elevation: 1200 },
        { time: 1500, distance: 5000, elevation: 1840 }
      ],
      stats: { totalAscent: 655, totalDescent: 655 }
    }))

    const { ensureIndex, derived } = useActivityMetricsIndex()
    await ensureIndex([makeActivity('a')])

    expect(elevationChange).not.toHaveBeenCalled()
    expect(derived.value.get('a')).toMatchObject({ ascent: 655, descent: 655 })
  })

  it('leaves out what the activity does not have', async () => {
    // A gym session has calories and a heart rate, and no elevation at all.
    const { ensureIndex, derived } = withStats({ calories: 410, averageHeartRate: 118 })
    getDetails.mockImplementation(async (id: string) => ({
      id,
      samples: [{ time: 0, heartRate: 118 }],
      stats: { calories: 410, averageHeartRate: 118 }
    }))
    await ensureIndex([makeActivity('a')])

    const values = derived.value.get('a')!
    expect(values.calories).toBe(410)
    expect(values.ascent).toBeUndefined()
    expect(values.maxSpeed).toBeUndefined()
  })

  it('still records the best times alongside them', async () => {
    const { ensureIndex, derived } = withStats({ calories: 620 })
    await ensureIndex([makeActivity('a')])

    expect(derived.value.get('a')?.time_5000).toBe(1500)
  })
})
