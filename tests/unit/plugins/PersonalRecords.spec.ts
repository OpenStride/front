import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Activity } from '@/types/activity'
import type { RecordPeriod } from '@plugins/app-extensions/Statistics/types'
import { INDEX_VERSION, type ActivityMetricsRow } from '@/composables/useActivityMetricsIndex'

const mocks = vi.hoisted(() => ({
  getPluginContext: vi.fn()
}))

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: mocks.getPluginContext
}))

/**
 * The composable and the index it reads both hold module-level state — the
 * cached rows, and the once-per-session cleanup of the legacy cache.
 * Re-importing per test keeps each case independent of that state.
 */
async function loadComposable() {
  vi.resetModules()
  const mod = await import('@plugins/app-extensions/Statistics/composables/usePersonalRecords')
  return mod.usePersonalRecords
}

const now = new Date()

function makeActivity(id: string, startTime: number): Activity {
  return {
    id,
    startTime,
    distance: 12000,
    duration: 3600,
    type: 'running',
    provider: 'test',
    version: 1,
    lastModified: 1
  } as Activity
}

/** An activity inside the current calendar month */
function thisMonth(dayOffset = 0): number {
  return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0).getTime() + dayOffset * 3600_000
}

function lastYear(): number {
  return new Date(now.getFullYear() - 1, 5, 10, 12, 0, 0).getTime()
}

let indexRows: ActivityMetricsRow[]
let getDetails: ReturnType<typeof vi.fn>
let addItemsToStore: ReturnType<typeof vi.fn>
let getData: ReturnType<typeof vi.fn>
let deleteData: ReturnType<typeof vi.fn>
let exportDB: ReturnType<typeof vi.fn>

function row(id: string, startTime: number, values: Record<string, number>): ActivityMetricsRow {
  return { id, startTime, sport: 'running', indexVersion: INDEX_VERSION, values }
}

function setupContext() {
  getDetails = vi.fn(async () => undefined)
  addItemsToStore = vi.fn(async () => undefined)
  deleteData = vi.fn(async () => undefined)
  getData = vi.fn(async () => null)
  exportDB = vi.fn(async (store: string) => (store === 'activity_metrics' ? indexRows : []))

  mocks.getPluginContext.mockResolvedValue({
    storage: { exportDB, addItemsToStore, getData, deleteData, saveData: vi.fn() },
    activity: { getDetails },
    analyzer: { create: () => ({ bestSegments: () => ({}) }) }
  })
}

async function run(activities: Activity[], period: RecordPeriod) {
  const usePersonalRecords = await loadComposable()
  const state = usePersonalRecords(ref(activities), ref('running'), ref(period))
  await vi.waitFor(() => expect(exportDB).toHaveBeenCalled())
  await vi.waitFor(() => expect(state.computing.value).toBe(false))
  return state
}

describe('usePersonalRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    indexRows = []
    setupContext()
  })

  it('reads the times straight from the index, without touching any sample', async () => {
    const activities = [makeActivity('a', thisMonth())]
    indexRows = [row('a', thisMonth(), { time_5000: 1300, time_10000: 2700 })]

    const { records } = await run(activities, 'all')

    expect(getDetails).not.toHaveBeenCalled()
    expect(records.value.map(r => r.distanceLabel)).toEqual(['5K', '10K'])
    expect(records.value[0].duration).toBe(1300)
  })

  it('keeps the fastest time across activities', async () => {
    const activities = [makeActivity('a', thisMonth()), makeActivity('b', thisMonth(2))]
    indexRows = [
      row('a', thisMonth(), { time_5000: 1300 }),
      row('b', thisMonth(2), { time_5000: 1255 })
    ]

    const { records } = await run(activities, 'all')

    expect(records.value[0].duration).toBe(1255)
    expect(records.value[0].activityId).toBe('b')
  })

  it('restricts the records to the selected period', async () => {
    const activities = [makeActivity('old', lastYear()), makeActivity('recent', thisMonth())]
    indexRows = [
      row('old', lastYear(), { time_5000: 1200 }),
      row('recent', thisMonth(), { time_5000: 1400 })
    ]

    const allTime = await run(activities, 'all')
    expect(allTime.records.value[0].duration).toBe(1200)

    vi.clearAllMocks()
    setupContext()
    const month = await run(activities, 'month')
    expect(month.records.value[0].duration).toBe(1400)
    expect(month.records.value[0].activityId).toBe('recent')
  })

  it('derives pace and speed from the stored duration', async () => {
    indexRows = [row('a', thisMonth(), { time_10000: 2700 })]

    const { records } = await run([makeActivity('a', thisMonth())], 'all')

    // Stored in SI, not in display units: a record must not depend on whether
    // the reader prefers kilometres or miles.
    // 10 km in 45 min -> 0.27 s/m (4'30/km), 3.70 m/s (13.33 km/h)
    expect(records.value[0].pace).toBeCloseTo(0.27, 5)
    expect(records.value[0].speed).toBeCloseTo(3.7037, 3)
  })

  it('ignores distances the index has no time for', async () => {
    indexRows = [row('a', thisMonth(), { time_5000: 1300, time_50000: 20000 })]

    const { records } = await run([makeActivity('a', thisMonth())], 'all')

    // 50 km is indexed but not part of the records table
    expect(records.value.map(r => r.distance)).toEqual([5000])
  })

  it('returns nothing when the period holds no indexed activity', async () => {
    const activities = [makeActivity('old', lastYear())]
    indexRows = [row('old', lastYear(), { time_5000: 1200 })]

    const { records } = await run(activities, 'month')

    expect(records.value).toEqual([])
  })

  it('drops the legacy settings cache that used to be synced to the cloud', async () => {
    getData.mockImplementation(async (key: string) =>
      key === 'statistics_pr_cache_running' ? { records: [] } : null
    )
    indexRows = [row('a', thisMonth(), { time_5000: 1300 })]

    await run([makeActivity('a', thisMonth())], 'all')

    await vi.waitFor(() => expect(deleteData).toHaveBeenCalledWith('statistics_pr_cache_running'))
  })
})
