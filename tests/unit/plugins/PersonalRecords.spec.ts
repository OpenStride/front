import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Activity, ActivityDetails } from '@/types/activity'
import type { RecordPeriod } from '@plugins/app-extensions/Statistics/types'

const mocks = vi.hoisted(() => ({
  getPluginContext: vi.fn()
}))

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: mocks.getPluginContext
}))

const { usePersonalRecords } =
  await import('@plugins/app-extensions/Statistics/composables/usePersonalRecords')

const now = new Date()

function makeActivity(index: number, startTime: number): Activity {
  return {
    id: `act-${index}`,
    startTime,
    distance: 5000,
    duration: 1500,
    type: 'running',
    provider: 'test',
    version: 1,
    lastModified: 1000 + index
  } as Activity
}

function makeDetails(id: string): ActivityDetails {
  return {
    id,
    samples: [
      { timeOffset: 0, time: 0, distance: 0 },
      { timeOffset: 300, time: 300, distance: 1000 }
    ],
    laps: [],
    version: 1,
    lastModified: 1
  } as unknown as ActivityDetails
}

/** `count` activities inside the current calendar month */
function thisMonthActivities(count: number): Activity[] {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0).getTime()
  return Array.from({ length: count }, (_, i) => makeActivity(i, start + i * 1000))
}

let exportDB: ReturnType<typeof vi.fn>
let getDetails: ReturnType<typeof vi.fn>
let saveData: ReturnType<typeof vi.fn>

function setupContext() {
  exportDB = vi.fn(async () => [] as ActivityDetails[])
  getDetails = vi.fn(async (id: string) => makeDetails(id))
  saveData = vi.fn(async () => undefined)

  mocks.getPluginContext.mockResolvedValue({
    storage: {
      getData: vi.fn(async () => null),
      saveData,
      exportDB
    },
    activity: { getDetails },
    analyzer: {
      // Every activity yields the same 1K segment, so records stay deterministic
      create: () => ({ bestSegments: () => ({ 1000: { duration: 300 } }) })
    }
  })
}

async function runRecords(activities: Activity[], period: RecordPeriod) {
  const state = usePersonalRecords(ref(activities), ref('running'), ref(period))
  await vi.waitFor(() => {
    expect(saveData).toHaveBeenCalled()
  })
  return state
}

describe('usePersonalRecords details loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupContext()
  })

  it('fetches only the activities of the period when the period is small', async () => {
    const activities = thisMonthActivities(5)
    await runRecords(activities, 'month')

    expect(exportDB).not.toHaveBeenCalled()
    expect(getDetails).toHaveBeenCalledTimes(5)
    expect(getDetails.mock.calls.map(c => c[0]).sort()).toEqual(activities.map(a => a.id).sort())
  })

  it('falls back to a single bulk read above the targeted-fetch threshold', async () => {
    await runRecords(thisMonthActivities(200), 'month')

    expect(exportDB).toHaveBeenCalledTimes(1)
    expect(exportDB).toHaveBeenCalledWith('activity_details')
    expect(getDetails).not.toHaveBeenCalled()
  })

  it('ignores activities outside the selected period', async () => {
    const lastYear = new Date(now.getFullYear() - 1, 5, 10, 12, 0, 0).getTime()
    const activities = [...thisMonthActivities(3), makeActivity(99, lastYear)]

    await runRecords(activities, 'month')

    expect(getDetails).toHaveBeenCalledTimes(3)
    expect(getDetails.mock.calls.map(c => c[0])).not.toContain('act-99')
  })

  it('scans the whole history for the all-time period', async () => {
    const lastYear = new Date(now.getFullYear() - 1, 5, 10, 12, 0, 0).getTime()
    const activities = [...thisMonthActivities(3), makeActivity(99, lastYear)]

    await runRecords(activities, 'all')

    expect(getDetails).toHaveBeenCalledTimes(4)
    expect(getDetails.mock.calls.map(c => c[0])).toContain('act-99')
  })

  it('caches the computed records under the selected period', async () => {
    const { records } = await runRecords(thisMonthActivities(4), 'quarter')

    expect(records.value).toHaveLength(1)
    expect(records.value[0].distanceLabel).toBe('1K')

    const [key, payload] = saveData.mock.calls[0]
    expect(key).toBe('statistics_pr_cache_running')
    expect(payload.periods.quarter.records).toHaveLength(1)
    expect(payload.periods.quarter.periodKey).toMatch(/^\d{4}-Q[1-4]$/)
  })

  it('skips loading entirely when the period holds no activity', async () => {
    const lastYear = new Date(now.getFullYear() - 1, 5, 10, 12, 0, 0).getTime()
    const { records } = await runRecords([makeActivity(1, lastYear)], 'month')

    expect(records.value).toEqual([])
    expect(exportDB).not.toHaveBeenCalled()
    expect(getDetails).not.toHaveBeenCalled()
  })
})
