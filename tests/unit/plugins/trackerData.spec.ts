import { describe, it, expect } from 'vitest'
import type { Activity } from '@/types/activity'
import { getMetric, timeMetricId } from '@plugins/app-extensions/MetricTracker/metrics'
import {
  bestOuting,
  defaultGrain,
  mainSport,
  metricKind,
  outingsOf,
  periodSeries,
  periodStart,
  recordSteps
} from '@plugins/app-extensions/MetricTracker/trackerData'
import type { MetricSources } from '@plugins/app-extensions/MetricTracker/types'

function run(id: string, iso: string, km: number, minutes: number, fields: Partial<Activity> = {}) {
  return {
    id,
    type: 'running',
    provider: 'test',
    startTime: new Date(iso).getTime(),
    distance: km * 1000,
    duration: minutes * 60,
    version: 1,
    lastModified: 1,
    ...fields
  } as Activity
}

const none: MetricSources = { stats: new Map(), derived: new Map() }
// Wednesday 4 November 2026
const NOW = new Date('2026-11-04T18:00:00')

describe('metricKind', () => {
  it('sorts metrics by the chart they need', () => {
    expect(metricKind(getMetric('distance'))).toBe('volume')
    expect(metricKind(getMetric('pace'))).toBe('intensity')
    expect(metricKind(getMetric('avgHeartRate'))).toBe('intensity')
    expect(metricKind(getMetric(timeMetricId(5000)))).toBe('best')
  })
})

describe('periodStart and defaultGrain', () => {
  it('starts a week on Monday and a month on the 1st', () => {
    expect(periodStart(NOW, 'week')).toEqual(new Date('2026-11-02T00:00:00'))
    expect(periodStart(NOW, 'month')).toEqual(new Date('2026-11-01T00:00:00'))
  })

  it('reads short windows by week and long ones by month', () => {
    expect(defaultGrain('3m')).toBe('week')
    expect(defaultGrain('6m')).toBe('week')
    expect(defaultGrain('12m')).toBe('month')
    expect(defaultGrain('all')).toBe('month')
  })
})

describe('periodSeries — volume', () => {
  it('sums each week and counts a week without an outing as zero', () => {
    const activities = [
      run('a', '2026-10-27T07:00:00', 10, 50),
      run('b', '2026-10-29T07:00:00', 8, 40),
      run('c', '2026-11-03T07:00:00', 5, 25)
    ]
    const periods = periodSeries(activities, none, getMetric('distance'), {
      grain: 'week',
      window: '3m',
      mode: 'avg',
      now: NOW
    })
    const last = periods.slice(-3)
    expect(last.map(p => p.value)).toEqual([0, 18, 5])
    expect(last[2].isCurrent).toBe(true)
  })
})

describe('periodSeries — intensity', () => {
  // Two runs the same week: 10 km in 50 min (5'00"/km) and 5 km in 30 min (6'00"/km)
  const week = [
    run('fast', '2026-10-27T07:00:00', 10, 50),
    run('slow', '2026-10-29T07:00:00', 5, 30)
  ]
  const opts = { grain: 'week' as const, window: '3m' as const, now: NOW }

  it('the average point is the week’s total time over its total distance', () => {
    const periods = periodSeries(week, none, getMetric('pace'), { ...opts, mode: 'avg' })
    const lastWeek = periods[periods.length - 2]
    // 80 min over 15 km = 5'20"/km, not the mean of 5'00" and 6'00"
    expect(lastWeek.value).toBeCloseTo(80 / 15, 5)
  })

  it('the best point is the week’s fastest outing, and says which', () => {
    const periods = periodSeries(week, none, getMetric('pace'), { ...opts, mode: 'best' })
    const lastWeek = periods[periods.length - 2]
    expect(lastWeek.value).toBeCloseTo(5, 5)
    expect(lastWeek.bestOuting?.id).toBe('fast')
  })

  it('leaves a week without an outing without a value, not at zero', () => {
    const periods = periodSeries(week, none, getMetric('pace'), { ...opts, mode: 'avg' })
    expect(periods[periods.length - 1].value).toBeNull()
  })
})

describe('outings, records and the main sport', () => {
  const sources = (times: Record<string, number>): MetricSources => ({
    stats: new Map(),
    derived: new Map(Object.entries(times).map(([id, t]) => [id, { [timeMetricId(5000)]: t }]))
  })
  const fiveK = getMetric(timeMetricId(5000))

  it('reads each outing’s own value, in display units', () => {
    const activities = [run('a', '2026-10-01T07:00:00', 10, 50)]
    expect(outingsOf(activities, none, getMetric('pace'))[0].value).toBeCloseTo(5, 5)
  })

  it('marks the periods that set a new record, measured against what came before', () => {
    const activities = [
      run('a', '2026-08-03T07:00:00', 6, 30),
      run('b', '2026-09-07T07:00:00', 6, 30),
      run('c', '2026-10-05T07:00:00', 6, 30)
    ]
    const src = sources({ a: 1500, b: 1520, c: 1480 })
    const periods = periodSeries(activities, src, fiveK, {
      grain: 'month',
      window: '6m',
      mode: 'best',
      now: NOW
    }).filter(p => p.value !== null)
    expect(periods.map(p => p.value)).toEqual([1500, 1520, 1480])
    expect(recordSteps(periods, fiveK, null).map(s => s.isNew)).toEqual([true, false, true])
    // An older, faster outing outside the window keeps them from being records
    expect(recordSteps(periods, fiveK, 1400).some(s => s.isNew)).toBe(false)
    expect(bestOuting(outingsOf(activities, src, fiveK), fiveK)?.id).toBe('c')
  })

  it('finds the main sport, legacy names merged', () => {
    const activities = [
      run('a', '2026-10-01T07:00:00', 5, 25, { type: 'run' }),
      run('b', '2026-10-02T07:00:00', 5, 25, { type: 'running' }),
      run('c', '2026-10-03T07:00:00', 30, 60, { type: 'cycling' })
    ]
    expect(mainSport(activities)).toBe('running')
  })
})
