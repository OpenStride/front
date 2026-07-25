import { describe, it, expect } from 'vitest'
import type { Activity } from '@/types/activity'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import { buildSeries, summarize } from '@plugins/app-extensions/MetricTracker/series'
import { METRICS, getMetric } from '@plugins/app-extensions/MetricTracker/metrics'
import {
  GRANULARITIES,
  needsDetails,
  type StatsMap
} from '@plugins/app-extensions/MetricTracker/types'

function makeActivity(id: string, isoDate: string, fields: Partial<Activity> = {}): Activity {
  return {
    id,
    startTime: new Date(isoDate).getTime(),
    distance: 10000,
    duration: 3000,
    type: 'running',
    provider: 'test',
    version: 1,
    lastModified: 1,
    ...fields
  } as Activity
}

const noStats: StatsMap = new Map()

describe('buildSeries grouping', () => {
  it('emits one point per activity, sorted chronologically', () => {
    const activities = [
      makeActivity('b', '2026-03-10T08:00:00Z'),
      makeActivity('a', '2026-01-05T08:00:00Z'),
      makeActivity('c', '2026-05-20T08:00:00Z')
    ]

    const points = buildSeries(activities, noStats, getMetric('distance'), 'activity')

    expect(points.map(p => p.key)).toEqual(['a', 'b', 'c'])
    expect(points.map(p => p.value)).toEqual([10, 10, 10])
  })

  it('sums a metric over the month bucket and converts to the display unit', () => {
    const activities = [
      makeActivity('a', '2026-03-02T08:00:00Z', { distance: 5000 }),
      makeActivity('b', '2026-03-20T08:00:00Z', { distance: 12500 }),
      makeActivity('c', '2026-04-02T08:00:00Z', { distance: 8000 })
    ]

    const points = buildSeries(activities, noStats, getMetric('distance'), 'month')

    expect(points.map(p => p.key)).toEqual(['2026-03', '2026-04'])
    expect(points[0].value).toBeCloseTo(17.5, 5)
    expect(points[0].count).toBe(2)
    expect(points[1].value).toBeCloseTo(8, 5)
  })

  it('groups by ISO week and by year', () => {
    const activities = [
      makeActivity('a', '2026-03-02T08:00:00Z'),
      makeActivity('b', '2026-03-03T08:00:00Z'),
      makeActivity('c', '2027-03-03T08:00:00Z')
    ]

    expect(buildSeries(activities, noStats, getMetric('distance'), 'week')).toHaveLength(2)
    expect(buildSeries(activities, noStats, getMetric('distance'), 'year').map(p => p.key)).toEqual(
      ['2026', '2027']
    )
  })
})

describe('buildSeries aggregation ops', () => {
  it('weights a ratio metric by activity size instead of averaging averages', () => {
    // 5 km in 25 min (5'00"/km) and 30 km in 3 h (6'00"/km)
    const activities = [
      makeActivity('short', '2026-03-02T08:00:00Z', { distance: 5000, duration: 1500 }),
      makeActivity('long', '2026-03-20T08:00:00Z', { distance: 30000, duration: 10800 })
    ]

    const [point] = buildSeries(activities, noStats, getMetric('pace'), 'month')

    // Naive mean of the two paces would be 5.5 min/km; the honest figure is
    // 35 km in 12300 s = 5.857 min/km
    expect(point.value).toBeCloseTo(5.857, 3)
    expect(point.value).not.toBeCloseTo(5.5, 2)
  })

  it('takes the max of the bucket for max heart rate', () => {
    const activities = [
      makeActivity('a', '2026-03-02T08:00:00Z'),
      makeActivity('b', '2026-03-20T08:00:00Z')
    ]
    const stats: StatsMap = new Map([
      ['a', { maxHeartRate: 170 }],
      ['b', { maxHeartRate: 182 }]
    ])

    const [point] = buildSeries(activities, stats, getMetric('maxHeartRate'), 'month')

    expect(point.value).toBe(182)
    expect(point.count).toBe(2)
  })

  it('averages the bucket for mean heart rate', () => {
    const activities = [
      makeActivity('a', '2026-03-02T08:00:00Z'),
      makeActivity('b', '2026-03-20T08:00:00Z')
    ]
    const stats: StatsMap = new Map([
      ['a', { averageHeartRate: 140 }],
      ['b', { averageHeartRate: 160 }]
    ])

    const [point] = buildSeries(activities, stats, getMetric('avgHeartRate'), 'month')

    expect(point.value).toBe(150)
  })
})

describe('buildSeries missing data', () => {
  it('keeps the bucket but leaves a gap when no activity carries the metric', () => {
    const activities = [
      makeActivity('a', '2026-03-02T08:00:00Z'),
      makeActivity('b', '2026-04-02T08:00:00Z')
    ]
    const stats: StatsMap = new Map([['b', { maxHeartRate: 175 }]])

    const points = buildSeries(activities, stats, getMetric('maxHeartRate'), 'month')

    expect(points.map(p => p.key)).toEqual(['2026-03', '2026-04'])
    expect(points[0].value).toBeNull()
    expect(points[0].count).toBe(0)
    expect(points[1].value).toBe(175)
  })

  it('ignores an activity with a zero denominator instead of dividing by zero', () => {
    const activities = [
      makeActivity('broken', '2026-03-02T08:00:00Z', { distance: 5000, duration: 0 })
    ]

    const [point] = buildSeries(activities, noStats, getMetric('pace'), 'month')

    expect(point.value).toBeNull()
    expect(point.count).toBe(0)
  })

  it('accepts startTime in seconds as well as milliseconds', () => {
    const ms = new Date('2026-03-02T08:00:00Z').getTime()
    const activities = [
      makeActivity('sec', '2026-03-02T08:00:00Z', { startTime: Math.floor(ms / 1000) })
    ]

    expect(buildSeries(activities, noStats, getMetric('distance'), 'month')[0].key).toBe('2026-03')
  })
})

describe('summarize', () => {
  const activities = [
    makeActivity('a', '2026-01-05T08:00:00Z', { distance: 10000, duration: 3000 }),
    makeActivity('b', '2026-02-05T08:00:00Z', { distance: 10000, duration: 2400 })
  ]

  it('reports the lowest value as best for a lower-is-better metric', () => {
    const points = buildSeries(activities, noStats, getMetric('pace'), 'activity')
    const summary = summarize(points, getMetric('pace'))

    // 3000 s -> 5'00"/km, 2400 s -> 4'00"/km
    expect(summary?.best).toBeCloseTo(4, 5)
    expect(summary?.average).toBeCloseTo(4.5, 5)
    expect(summary?.count).toBe(2)
  })

  it('reports the highest value as best for a higher-is-better metric', () => {
    const points = buildSeries(activities, noStats, getMetric('speed'), 'activity')
    const summary = summarize(points, getMetric('speed'))

    expect(summary?.best).toBeCloseTo(15, 5)
  })

  it('returns null when every point is a gap', () => {
    const points = buildSeries(activities, noStats, getMetric('calories'), 'activity')

    expect(points.every(p => p.value === null)).toBe(true)
    expect(summarize(points, getMetric('calories'))).toBeNull()
  })
})

describe('metric registry', () => {
  it('formats each metric in its own unit', () => {
    expect(getMetric('distance').format(12.34)).toBe('12.3 km')
    expect(getMetric('duration').format(95)).toBe('1h35')
    expect(getMetric('duration').format(45)).toBe('45 min')
    expect(getMetric('pace').format(4.5)).toBe(`4'30"`)
    expect(getMetric('speed').format(15.02)).toBe('15.0 km/h')
    expect(getMetric('maxHeartRate').format(178.4)).toBe('178 bpm')
  })

  it('carries pace over to the next minute rather than showing 60 seconds', () => {
    expect(getMetric('pace').format(4.999)).toBe(`5'00"`)
  })

  it('flags only the stats-backed metrics as needing details', () => {
    expect(needsDetails(getMetric('distance'))).toBe(false)
    expect(needsDetails(getMetric('pace'))).toBe(false)
    expect(needsDetails(getMetric('maxHeartRate'))).toBe(true)
    expect(needsDetails(getMetric('calories'))).toBe(true)
  })

  it('falls back to the first metric for an unknown id', () => {
    expect(getMetric('nope').id).toBe(METRICS[0].id)
  })
})

describe('metric tracker i18n', () => {
  it('has a label for every metric and granularity in every locale', () => {
    for (const locale of [en, fr]) {
      const tracker = (locale as unknown as { metricTracker: Record<string, never> }).metricTracker
      const metrics = tracker.metrics as Record<string, string>
      const granularities = tracker.granularities as Record<string, string>

      for (const metric of METRICS) {
        expect(metrics[metric.id], `missing label for metric "${metric.id}"`).toBeTruthy()
      }
      for (const granularity of GRANULARITIES) {
        expect(granularities[granularity], `missing label for "${granularity}"`).toBeTruthy()
      }
      expect(
        (locale as unknown as { navigation: Record<string, string> }).navigation.metricTracker
      ).toBeTruthy()
    }
  })
})
