import { describe, it, expect } from 'vitest'
import {
  availableWindows,
  buildSeries,
  type WindowId
} from '@plugins/app-extensions/Statistics/aggregateSeries'
import type { AggregatedRecord, AggregationPeriod } from '@/types/aggregation'

function record(periodType: AggregationPeriod, key: string, value: number): AggregatedRecord {
  return {
    id: `agg|${periodType}|${key}`,
    metricId: 'agg',
    periodType,
    periodKey: key,
    value,
    sum: value,
    count: 1,
    lastUpdated: 0
  }
}

describe('availableWindows', () => {
  it('offers ranges on weekly and monthly cards', () => {
    expect(availableWindows('week')).toContain('3m')
    expect(availableWindows('month')).toContain('12m')
    expect(availableWindows('month')).toContain('all')
  })

  /** Three months of yearly buckets is one point, and one point is not a chart. */
  it('offers none on a yearly card', () => {
    expect(availableWindows('year')).toEqual([])
  })
})

describe('buildSeries', () => {
  const months = [
    record('month', '2026-03', 3),
    record('month', '2026-01', 1),
    record('month', '2026-02', 2)
  ]

  it('orders points oldest first, whatever order the store held them in', () => {
    expect(buildSeries(months, 'month', 'all').map(p => p.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03'
    ])
  })

  it('ignores the records of another period', () => {
    const mixed = [...months, record('week', '2026-W05', 9), record('year', '2026', 42)]

    expect(buildSeries(mixed, 'month', 'all')).toHaveLength(3)
  })

  /** A chart must end on the period being read, not on whatever came last. */
  it('keeps the tail when a window narrows the range', () => {
    const year = Array.from({ length: 12 }, (_, i) =>
      record('month', `2026-${String(i + 1).padStart(2, '0')}`, i)
    )

    const quarter = buildSeries(year, 'month', '3m')

    expect(quarter.map(p => p.key)).toEqual(['2026-10', '2026-11', '2026-12'])
  })

  it('sorts ISO week keys by week rather than alphabetically by accident', () => {
    const weeks = [
      record('week', '2026-W30', 30),
      record('week', '2026-W05', 5),
      record('week', '2026-W12', 12)
    ]

    expect(buildSeries(weeks, 'week', 'all').map(p => p.value)).toEqual([5, 12, 30])
  })

  it('drops a record whose value never landed', () => {
    const broken = [...months, record('month', '2026-04', Number.NaN)]

    expect(buildSeries(broken, 'month', 'all')).toHaveLength(3)
  })

  it('has nothing to plot from nothing', () => {
    expect(buildSeries([], 'month', 'all')).toEqual([])
  })

  it('leaves an unbounded window untouched', () => {
    const window: WindowId = 'all'
    expect(buildSeries(months, 'month', window)).toHaveLength(3)
  })
})
