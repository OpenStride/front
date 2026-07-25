import { describe, it, expect } from 'vitest'
import type { Activity } from '@/types/activity'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import { buildSeries, summarize, trendLine } from '@plugins/app-extensions/MetricTracker/series'
import {
  METRICS,
  DIRECT_METRICS,
  DERIVED_METRICS,
  DISTANCE_TARGETS,
  getMetric,
  hasMetric,
  timeMetricId
} from '@plugins/app-extensions/MetricTracker/metrics'
import {
  GRANULARITIES,
  needsDetails,
  needsIndex,
  type DerivedMap,
  type MetricSources,
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

const noSources: MetricSources = { stats: new Map(), derived: new Map() }

function withStats(stats: StatsMap): MetricSources {
  return { stats, derived: new Map() }
}

function withDerived(derived: DerivedMap): MetricSources {
  return { stats: new Map(), derived }
}

describe('buildSeries grouping', () => {
  it('emits one point per activity, sorted chronologically', () => {
    const activities = [
      makeActivity('b', '2026-03-10T08:00:00Z'),
      makeActivity('a', '2026-01-05T08:00:00Z'),
      makeActivity('c', '2026-05-20T08:00:00Z')
    ]

    const points = buildSeries(activities, noSources, getMetric('distance'), 'activity')

    expect(points.map(p => p.key)).toEqual(['a', 'b', 'c'])
    expect(points.map(p => p.value)).toEqual([10, 10, 10])
  })

  it('sums a metric over the month bucket and converts to the display unit', () => {
    const activities = [
      makeActivity('a', '2026-03-02T08:00:00Z', { distance: 5000 }),
      makeActivity('b', '2026-03-20T08:00:00Z', { distance: 12500 }),
      makeActivity('c', '2026-04-02T08:00:00Z', { distance: 8000 })
    ]

    const points = buildSeries(activities, noSources, getMetric('distance'), 'month')

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

    expect(buildSeries(activities, noSources, getMetric('distance'), 'week')).toHaveLength(2)
    expect(
      buildSeries(activities, noSources, getMetric('distance'), 'year').map(p => p.key)
    ).toEqual(['2026', '2027'])
  })
})

describe('buildSeries aggregation ops', () => {
  it('weights a ratio metric by activity size instead of averaging averages', () => {
    // 5 km in 25 min (5'00"/km) and 30 km in 3 h (6'00"/km)
    const activities = [
      makeActivity('short', '2026-03-02T08:00:00Z', { distance: 5000, duration: 1500 }),
      makeActivity('long', '2026-03-20T08:00:00Z', { distance: 30000, duration: 10800 })
    ]

    const [point] = buildSeries(activities, noSources, getMetric('pace'), 'month')

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

    const [point] = buildSeries(activities, withStats(stats), getMetric('maxHeartRate'), 'month')

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

    const [point] = buildSeries(activities, withStats(stats), getMetric('avgHeartRate'), 'month')

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

    const points = buildSeries(activities, withStats(stats), getMetric('maxHeartRate'), 'month')

    expect(points.map(p => p.key)).toEqual(['2026-03', '2026-04'])
    expect(points[0].value).toBeNull()
    expect(points[0].count).toBe(0)
    expect(points[1].value).toBe(175)
  })

  it('ignores an activity with a zero denominator instead of dividing by zero', () => {
    const activities = [
      makeActivity('broken', '2026-03-02T08:00:00Z', { distance: 5000, duration: 0 })
    ]

    const [point] = buildSeries(activities, noSources, getMetric('pace'), 'month')

    expect(point.value).toBeNull()
    expect(point.count).toBe(0)
  })

  it('accepts startTime in seconds as well as milliseconds', () => {
    const ms = new Date('2026-03-02T08:00:00Z').getTime()
    const activities = [
      makeActivity('sec', '2026-03-02T08:00:00Z', { startTime: Math.floor(ms / 1000) })
    ]

    expect(buildSeries(activities, noSources, getMetric('distance'), 'month')[0].key).toBe(
      '2026-03'
    )
  })
})

describe('summarize', () => {
  const activities = [
    makeActivity('a', '2026-01-05T08:00:00Z', { distance: 10000, duration: 3000 }),
    makeActivity('b', '2026-02-05T08:00:00Z', { distance: 10000, duration: 2400 })
  ]

  it('reports the lowest value as best for a lower-is-better metric', () => {
    const points = buildSeries(activities, noSources, getMetric('pace'), 'activity')
    const summary = summarize(points, getMetric('pace'))

    // 3000 s -> 5'00"/km, 2400 s -> 4'00"/km
    expect(summary?.best).toBeCloseTo(4, 5)
    expect(summary?.average).toBeCloseTo(4.5, 5)
    expect(summary?.count).toBe(2)
  })

  it('reports the highest value as best for a higher-is-better metric', () => {
    const points = buildSeries(activities, noSources, getMetric('speed'), 'activity')
    const summary = summarize(points, getMetric('speed'))

    expect(summary?.best).toBeCloseTo(15, 5)
  })

  it('returns null when every point is a gap', () => {
    const points = buildSeries(activities, noSources, getMetric('calories'), 'activity')

    expect(points.every(p => p.value === null)).toBe(true)
    expect(summarize(points, getMetric('calories'))).toBeNull()
  })
})

describe('trendLine', () => {
  function pointsFrom(entries: [string, number | null][]) {
    return entries.map(([isoDate, value]) => ({
      key: isoDate,
      startTime: new Date(isoDate).getTime(),
      value,
      count: value === null ? 0 : 1
    }))
  }

  it('fits a descending trend on improving values', () => {
    const points = pointsFrom([
      ['2026-01-01T00:00:00Z', 1400],
      ['2026-02-01T00:00:00Z', 1350],
      ['2026-03-01T00:00:00Z', 1300]
    ])

    const trend = trendLine(points)

    expect(trend[0]! > trend[1]!).toBe(true)
    expect(trend[1]! > trend[2]!).toBe(true)
  })

  it('reproduces a series that is linear in time exactly', () => {
    // 10 days apart — unlike calendar months, which are not equal
    const points = pointsFrom([
      ['2026-01-01T00:00:00Z', 1400],
      ['2026-01-11T00:00:00Z', 1350],
      ['2026-01-21T00:00:00Z', 1300]
    ])

    const trend = trendLine(points)

    expect(trend[0]).toBeCloseTo(1400, 6)
    expect(trend[1]).toBeCloseTo(1350, 6)
    expect(trend[2]).toBeCloseTo(1300, 6)
  })

  it('does not treat unequal calendar months as equal steps', () => {
    // January is 31 days, February 28: a fit on the point index would land the
    // middle point on the midpoint, a fit on real time cannot
    const points = pointsFrom([
      ['2026-01-01T00:00:00Z', 1400],
      ['2026-02-01T00:00:00Z', 1350],
      ['2026-03-01T00:00:00Z', 1300]
    ])

    expect(trendLine(points)[1]).not.toBeCloseTo(1350, 1)
  })

  it('spans the gaps so the line covers the whole chart', () => {
    const points = pointsFrom([
      ['2026-01-01T00:00:00Z', 100],
      ['2026-02-01T00:00:00Z', null],
      ['2026-03-01T00:00:00Z', 200]
    ])

    const trend = trendLine(points)

    expect(trend.every(v => v !== null)).toBe(true)
    expect(trend[1]).toBeGreaterThan(trend[0]!)
    expect(trend[1]).toBeLessThan(trend[2]!)
  })

  it('weights by real time rather than by point order', () => {
    // Three points in one week, then one far later: an index-based fit would
    // read the cluster as three quarters of the timeline
    const clustered = pointsFrom([
      ['2026-01-01T00:00:00Z', 100],
      ['2026-01-02T00:00:00Z', 100],
      ['2026-01-03T00:00:00Z', 100],
      ['2026-12-31T00:00:00Z', 200]
    ])

    const trend = trendLine(clustered)

    // The cluster pins the start of the trend near its own value
    expect(trend[0]).toBeGreaterThan(95)
    expect(trend[0]).toBeLessThan(110)
    expect(trend[3]).toBeGreaterThan(180)
  })

  it('returns a flat line when every point shares one date', () => {
    const sameDay = pointsFrom([
      ['2026-01-01T00:00:00Z', 100],
      ['2026-01-01T00:00:00Z', 200]
    ])

    expect(trendLine(sameDay)).toEqual([150, 150])
  })

  it('has nothing to fit below two values', () => {
    expect(trendLine(pointsFrom([['2026-01-01T00:00:00Z', 100]]))).toEqual([null])
    expect(
      trendLine(
        pointsFrom([
          ['2026-01-01T00:00:00Z', null],
          ['2026-02-01T00:00:00Z', 100]
        ])
      )
    ).toEqual([null, null])
  })

  it('produces one trend value per point, gaps included', () => {
    const points = buildSeries(
      [
        makeActivity('a', '2026-01-05T08:00:00Z'),
        makeActivity('b', '2026-02-05T08:00:00Z'),
        makeActivity('c', '2026-03-05T08:00:00Z')
      ],
      noSources,
      getMetric('distance'),
      'activity'
    )

    expect(trendLine(points)).toHaveLength(points.length)
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

  it('routes each metric to the source it actually depends on', () => {
    expect(needsDetails(getMetric('distance'))).toBe(false)
    expect(needsIndex(getMetric('distance'))).toBe(false)

    expect(needsDetails(getMetric('pace'))).toBe(false)
    expect(needsIndex(getMetric('pace'))).toBe(false)

    expect(needsDetails(getMetric('maxHeartRate'))).toBe(true)
    expect(needsIndex(getMetric('maxHeartRate'))).toBe(false)

    expect(needsDetails(getMetric('time_5000'))).toBe(false)
    expect(needsIndex(getMetric('time_5000'))).toBe(true)
  })

  it('falls back to the first metric for an unknown id', () => {
    expect(getMetric('nope').id).toBe(METRICS[0].id)
    expect(hasMetric('nope')).toBe(false)
    expect(hasMetric('time_5000')).toBe(true)
  })

  it('formats a best time as a clock reading', () => {
    expect(getMetric('time_5000').format(1234)).toBe('20:34')
    expect(getMetric('time_42195').format(11_567)).toBe('3:12:47')
    expect(getMetric('time_5000').betterIsLower).toBe(true)
  })
})

describe('derived time metrics', () => {
  const activities = [
    makeActivity('a', '2026-03-02T08:00:00Z'),
    makeActivity('b', '2026-03-20T08:00:00Z'),
    makeActivity('c', '2026-04-04T08:00:00Z')
  ]
  const derived: DerivedMap = new Map<string, Record<string, number>>([
    ['a', { time_5000: 1300 }],
    ['b', { time_5000: 1255 }],
    // c ran that day but never covered 5 km
    ['c', {}]
  ])

  it('keeps the best time of the bucket', () => {
    const points = buildSeries(activities, withDerived(derived), getMetric('time_5000'), 'month')

    expect(points.map(p => p.key)).toEqual(['2026-03', '2026-04'])
    expect(points[0].value).toBe(1255)
    expect(points[0].count).toBe(2)
  })

  it('leaves a gap for an outing shorter than the distance', () => {
    const points = buildSeries(activities, withDerived(derived), getMetric('time_5000'), 'activity')

    expect(points.map(p => p.value)).toEqual([1300, 1255, null])
  })

  it('treats the fastest time as the best of the series', () => {
    const points = buildSeries(activities, withDerived(derived), getMetric('time_5000'), 'activity')
    const summary = summarize(points, getMetric('time_5000'))

    expect(summary?.best).toBe(1255)
    expect(summary?.count).toBe(2)
  })
})

describe('deep link from the session bests table', () => {
  // ActivityBests links to /metrics?metric=time_<dist> for each of its rows, so
  // every distance it displays must resolve to a real metric
  const BESTS_TARGETS = [1000, 2000, 5000, 10000, 15000, 20000, 21097, 30000, 42195, 50000]

  it('exposes a metric for every distance of the bests table', () => {
    for (const meters of BESTS_TARGETS) {
      expect(hasMetric(timeMetricId(meters)), `no metric for ${meters} m`).toBe(true)
    }
  })

  it('declares the same targets in the registry and the index', () => {
    expect(DISTANCE_TARGETS.map(t => t.meters)).toEqual(BESTS_TARGETS)
  })
})

describe('metric tracker i18n', () => {
  it('has a label for every direct metric and granularity in every locale', () => {
    for (const locale of [en, fr]) {
      const tracker = (locale as unknown as { metricTracker: Record<string, never> }).metricTracker
      const metrics = tracker.metrics as Record<string, string>
      const granularities = tracker.granularities as Record<string, string>

      for (const metric of DIRECT_METRICS) {
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

  it('labels the derived metrics from a single pattern', () => {
    for (const locale of [en, fr]) {
      const tracker = (
        locale as unknown as {
          metricTracker: { timeOn: string; groups: Record<string, string> }
        }
      ).metricTracker

      expect(tracker.timeOn).toContain('{distance}')
      expect(tracker.groups.direct).toBeTruthy()
      expect(tracker.groups.bestTimes).toBeTruthy()
    }

    // Every derived metric carries the label the pattern interpolates
    for (const metric of DERIVED_METRICS) {
      expect(metric.distanceLabel, `no distance label for "${metric.id}"`).toBeTruthy()
    }
  })
})
