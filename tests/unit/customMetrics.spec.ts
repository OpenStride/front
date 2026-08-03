import { describe, it, expect, beforeEach } from 'vitest'
import {
  toMetricDefinition,
  toMetricDefinitions
} from '@plugins/app-extensions/MetricTracker/customMetrics'
import { buildSeries } from '@plugins/app-extensions/MetricTracker/series'
import type { MetricSources } from '@plugins/app-extensions/MetricTracker/types'
import { needsIndex } from '@plugins/app-extensions/MetricTracker/types'
import { aggregateSumKey, aggregateWeightKey } from '@/types/customAggregate'
import type { CustomAggregate } from '@/types/customAggregate'
import { setUnitSystem } from '@/composables/useUnits'
import type { Activity } from '@/types/activity'
import { createActivity } from '../fixtures/activities'

const ID = 'agg-1'

function aggregate(over: Partial<CustomAggregate> = {}): CustomAggregate {
  return {
    id: ID,
    version: 1,
    lastModified: 0,
    label: 'FC en côte',
    enabled: true,
    where: [{ field: 'slope', min: 0.02 }],
    measure: { field: 'heartRate', op: 'avg' },
    weightBy: 'time',
    periodOp: 'avg',
    ...over
  }
}

/** One activity carrying the pair the index writes for an aggregate. */
function indexed(id: string, iso: string, sum: number, weight: number) {
  return {
    activity: createActivity({ id, startTime: new Date(iso).getTime(), type: 'running' }),
    values: { [aggregateSumKey(ID)]: sum, [aggregateWeightKey(ID)]: weight }
  }
}

function sources(rows: ReturnType<typeof indexed>[]): MetricSources {
  return {
    stats: new Map(),
    derived: new Map(rows.map(r => [r.activity.id, r.values]))
  }
}

describe('toMetricDefinition', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('carries the name the reader gave it rather than a locale key', () => {
    expect(toMetricDefinition(aggregate()).label).toBe('FC en côte')
  })

  /**
   * The whole reason the index stores a sum and a weight instead of a ratio: a
   * month has to be the sum of the sums over the sum of the weights.
   */
  it('turns an average into a ratio over the stored pair', () => {
    const definition = toMetricDefinition(aggregate())

    expect(definition.periodOp).toBe('ratio')
    expect(definition.sourceRef).toBe(`derived.${aggregateSumKey(ID)}`)
    expect(definition.denominatorRef).toBe(`derived.${aggregateWeightKey(ID)}`)
  })

  it('needs no denominator for an extremum, which the sum slot already holds', () => {
    const max = toMetricDefinition(aggregate({ measure: { field: 'heartRate', op: 'max' } }))

    expect(max.periodOp).toBe('max')
    expect(max.denominatorRef).toBeUndefined()
  })

  it('sums without a denominator too', () => {
    const total = toMetricDefinition(aggregate({ measure: { field: 'power', op: 'sum' } }))

    expect(total.periodOp).toBe('sum')
    expect(total.denominatorRef).toBeUndefined()
  })

  it('tells the tracker it reads the index, so the pass is triggered', () => {
    expect(needsIndex(toMetricDefinition(aggregate()))).toBe(true)
  })

  it('labels a dimensionless field with its own symbol', () => {
    const definition = toMetricDefinition(aggregate())

    expect(definition.toDisplay(152)).toBe(152)
    expect(definition.format(152.4)).toBe('152 bpm')
  })

  it('reads a field with a dimension in the reader units', () => {
    const definition = toMetricDefinition(aggregate({ measure: { field: 'speed', op: 'avg' } }))

    // 5 m/s is 18 km/h.
    expect(definition.toDisplay(5)).toBeCloseTo(18, 6)
    expect(definition.format(18)).toContain('km/h')
  })

  it('scales a slope out of the ratio it is stored as', () => {
    const definition = toMetricDefinition(aggregate({ measure: { field: 'slope', op: 'avg' } }))

    expect(definition.toDisplay(0.05)).toBeCloseTo(5, 6)
    expect(definition.format(5)).toBe('5 %')
  })

  it('leaves a disabled definition out of the list', () => {
    const list = toMetricDefinitions([aggregate(), aggregate({ id: 'off', enabled: false })])

    expect(list.map(m => m.id)).toEqual([ID])
  })
})

describe('a custom aggregate, plotted', () => {
  beforeEach(() => setUnitSystem('metric'))

  /**
   * Two outings of very different lengths in one month. The monthly point has
   * to be the weighted average, not the mean of the two per-outing averages —
   * which is what an unweighted `avg` over per-activity ratios would give.
   */
  it('weights a monthly point by the time behind each outing', () => {
    const rows = [
      // 20 min at 150 bpm, then 180 min at 130 bpm
      indexed('short', '2026-03-02T10:00:00Z', 150 * 1200, 1200),
      indexed('long', '2026-03-03T10:00:00Z', 130 * 10800, 10800)
    ]

    const [point] = buildSeries(
      rows.map(r => r.activity) as Activity[],
      sources(rows),
      toMetricDefinition(aggregate()),
      'month'
    )

    const weighted = (150 * 1200 + 130 * 10800) / (1200 + 10800)
    expect(point.value).toBeCloseTo(weighted, 6)
    // The mean of the two per-outing averages would have been 140.
    expect(point.value).not.toBeCloseTo(140, 1)
  })

  it('gives one point per outing at activity granularity', () => {
    const rows = [
      indexed('a', '2026-03-02T10:00:00Z', 150 * 600, 600),
      indexed('b', '2026-03-09T10:00:00Z', 160 * 600, 600)
    ]

    const points = buildSeries(
      rows.map(r => r.activity) as Activity[],
      sources(rows),
      toMetricDefinition(aggregate()),
      'activity'
    )

    expect(points).toHaveLength(2)
    expect(points[0].value).toBeCloseTo(150, 6)
    expect(points[1].value).toBeCloseTo(160, 6)
  })

  /** An outing where nothing qualified keeps its slot, with a gap. */
  it('leaves a gap for an outing the aggregate found nothing in', () => {
    const rows = [indexed('a', '2026-03-02T10:00:00Z', 150 * 600, 600)]
    const barren = {
      activity: createActivity({
        id: 'b',
        startTime: new Date('2026-03-09T10:00:00Z').getTime(),
        type: 'running'
      }),
      values: {}
    }

    const points = buildSeries(
      [rows[0].activity, barren.activity] as Activity[],
      sources([...rows, barren]),
      toMetricDefinition(aggregate()),
      'activity'
    )

    expect(points).toHaveLength(2)
    expect(points[1].value).toBeNull()
  })
})
