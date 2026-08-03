import { describe, it, expect } from 'vitest'
import { buildAggregateRecords } from '@/services/AggregatePeriodBuilder'
import type { ActivityMetricsRow } from '@/composables/useActivityMetricsIndex'
import type { CustomAggregate } from '@/types/customAggregate'
import { aggregateSumKey, aggregateWeightKey } from '@/types/customAggregate'

const ID = 'agg-1'

function define(overrides: Partial<CustomAggregate> = {}): CustomAggregate {
  return {
    id: ID,
    version: 1,
    lastModified: 0,
    label: 'Allure en côte',
    enabled: true,
    where: [],
    measure: { field: 'speed', op: 'avg' },
    weightBy: 'time',
    periodOp: 'avg',
    ...overrides
  }
}

/** One indexed activity contributing `sum` over `weight` on the given day. */
function row(
  id: string,
  iso: string,
  sum: number,
  weight: number,
  sport = 'running'
): ActivityMetricsRow {
  return {
    id,
    sport,
    startTime: new Date(iso).getTime(),
    indexVersion: 4,
    values: { [aggregateSumKey(ID)]: sum, [aggregateWeightKey(ID)]: weight }
  }
}

function find(records: ReturnType<typeof buildAggregateRecords>, period: string, key: string) {
  return records.find(r => r.periodType === period && r.periodKey === key)
}

describe('buildAggregateRecords', () => {
  it('rolls one activity into a week, a month and a year', () => {
    const records = buildAggregateRecords([row('a', '2026-03-10T10:00:00Z', 600, 200)], [define()])

    expect(records.map(r => r.periodType).sort()).toEqual(['month', 'week', 'year'])
    expect(records.every(r => r.metricId === ID)).toBe(true)
  })

  /**
   * The reason sum and weight are stored apart. A twenty-minute outing and a
   * three-hour one both averaging their own pace must not weigh the same in the
   * month that holds them.
   */
  it('divides the summed values by the summed weights, not by the activity count', () => {
    const records = buildAggregateRecords(
      [
        // 20 min at 3 m/s, then 180 min at 4 m/s
        row('short', '2026-03-02T10:00:00Z', 3 * 1200, 1200),
        row('long', '2026-03-03T10:00:00Z', 4 * 10800, 10800)
      ],
      [define()]
    )

    const month = find(records, 'month', '2026-03')!
    const weighted = (3 * 1200 + 4 * 10800) / (1200 + 10800)

    expect(month.value).toBeCloseTo(weighted, 6)
    // The mean of the two per-activity means would have been 3.5.
    expect(month.value).not.toBeCloseTo(3.5, 2)
  })

  it('keeps the activity count honest while weighting on the measurement', () => {
    const records = buildAggregateRecords(
      [row('a', '2026-03-02T10:00:00Z', 100, 2400), row('b', '2026-03-03T10:00:00Z', 200, 3600)],
      [define()]
    )

    const month = find(records, 'month', '2026-03')!

    expect(month.count).toBe(2)
    expect(month.weight).toBe(6000)
    expect(month.sum).toBe(300)
  })

  it('adds instead of averaging when the period operator says so', () => {
    const records = buildAggregateRecords(
      [row('a', '2026-03-02T10:00:00Z', 100, 10), row('b', '2026-03-03T10:00:00Z', 250, 10)],
      [define({ periodOp: 'sum' })]
    )

    expect(find(records, 'month', '2026-03')!.value).toBe(350)
  })

  it('takes the extremum across activities for min and max', () => {
    const rows = [
      row('a', '2026-03-02T10:00:00Z', 100, 10),
      row('b', '2026-03-03T10:00:00Z', 250, 10)
    ]

    expect(
      find(buildAggregateRecords(rows, [define({ periodOp: 'max' })]), 'month', '2026-03')!.value
    ).toBe(250)
    expect(
      find(buildAggregateRecords(rows, [define({ periodOp: 'min' })]), 'month', '2026-03')!.value
    ).toBe(100)
  })

  it('separates the periods an activity does not share', () => {
    const records = buildAggregateRecords(
      [row('a', '2026-03-15T10:00:00Z', 100, 10), row('b', '2026-04-15T10:00:00Z', 300, 10)],
      [define({ periodOp: 'sum' })]
    )

    expect(find(records, 'month', '2026-03')!.value).toBe(100)
    expect(find(records, 'month', '2026-04')!.value).toBe(300)
    expect(find(records, 'year', '2026')!.value).toBe(400)
  })

  it('ignores an activity the aggregate does not apply to', () => {
    const records = buildAggregateRecords(
      [
        row('bike', '2026-03-02T10:00:00Z', 100, 10, 'cycling'),
        row('run', '2026-03-03T10:00:00Z', 300, 10, 'running')
      ],
      [define({ sports: ['running'], periodOp: 'sum' })]
    )

    expect(find(records, 'month', '2026-03')!.value).toBe(300)
  })

  it('ignores a row the evaluation produced no value for', () => {
    const empty: ActivityMetricsRow = {
      id: 'nothing-qualified',
      sport: 'running',
      startTime: new Date('2026-03-02T10:00:00Z').getTime(),
      indexVersion: 4,
      values: {}
    }

    expect(buildAggregateRecords([empty], [define()])).toEqual([])
  })

  /** Filing a whole library under the epoch would be worse than losing a row. */
  it('drops a row with no usable date', () => {
    const undated = { ...row('a', '2026-03-02T10:00:00Z', 100, 10), startTime: 0 }

    expect(buildAggregateRecords([undated], [define()])).toEqual([])
  })

  it('builds each definition independently', () => {
    const rows: ActivityMetricsRow[] = [
      {
        id: 'a',
        sport: 'running',
        startTime: new Date('2026-03-02T10:00:00Z').getTime(),
        indexVersion: 4,
        values: {
          [aggregateSumKey('one')]: 100,
          [aggregateWeightKey('one')]: 10,
          [aggregateSumKey('two')]: 900,
          [aggregateWeightKey('two')]: 10
        }
      }
    ]

    const records = buildAggregateRecords(rows, [
      define({ id: 'one', periodOp: 'sum' }),
      define({ id: 'two', periodOp: 'sum' })
    ])

    expect(records.find(r => r.metricId === 'one' && r.periodType === 'year')!.value).toBe(100)
    expect(records.find(r => r.metricId === 'two' && r.periodType === 'year')!.value).toBe(900)
  })

  it('has nothing to build without definitions', () => {
    expect(buildAggregateRecords([row('a', '2026-03-02T10:00:00Z', 1, 1)], [])).toEqual([])
  })

  it('keys a record so it can be replaced rather than duplicated', () => {
    const first = buildAggregateRecords([row('a', '2026-03-02T10:00:00Z', 1, 1)], [define()])
    const second = buildAggregateRecords([row('a', '2026-03-02T10:00:00Z', 2, 2)], [define()])

    expect(first.map(r => r.id).sort()).toEqual(second.map(r => r.id).sort())
  })
})
