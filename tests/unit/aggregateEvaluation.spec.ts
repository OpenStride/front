import { describe, it, expect } from 'vitest'
import type { Sample } from '@/types/activity'
import type { CustomAggregate } from '@/types/customAggregate'
import { aggregateSumKey, aggregateWeightKey } from '@/types/customAggregate'
import { appliesToSport, evaluateAggregates, toMetricValues } from '@/services/AggregateEvaluator'
import { MAX_SAMPLE_GAP_S, SLOPE_WINDOW_METERS, deriveSeries } from '@/utils/derivedSamples'
import { buildCapabilityReport } from '@/composables/useSampleCapabilities'
import { summarizeSamples } from '@/types/sampleFields'

/** A trace at a constant 3 m/s, one sample a second, climbing `gradient`. */
function ramp(count: number, gradient: number, extra: (i: number) => Partial<Sample> = () => ({})) {
  return Array.from({ length: count }, (_, i) => ({
    time: i,
    distance: i * 3,
    elevation: 100 + i * 3 * gradient,
    ...extra(i)
  }))
}

function define(overrides: Partial<CustomAggregate> = {}): CustomAggregate {
  return {
    id: 'agg-1',
    version: 1,
    lastModified: 0,
    label: 'Test',
    enabled: true,
    where: [],
    measure: { field: 'speed', op: 'avg' },
    weightBy: 'time',
    periodOp: 'avg',
    ...overrides
  }
}

describe('deriveSeries', () => {
  it('measures a constant gradient as the ratio it is', () => {
    const { slope } = deriveSeries(ramp(200, 0.05))

    // Nothing before the window has been covered.
    expect(slope[10]).toBeUndefined()
    expect(slope[150]).toBeCloseTo(0.05, 6)
  })

  it('reports a descent as a negative ratio', () => {
    const { slope } = deriveSeries(ramp(200, -0.08))

    expect(slope[150]).toBeCloseTo(-0.08, 6)
  })

  it('says nothing until the window is covered', () => {
    const shortRun = ramp(10, 0.05)
    const covered = shortRun[shortRun.length - 1].distance - shortRun[0].distance

    expect(covered).toBeLessThan(SLOPE_WINDOW_METERS)
    expect(deriveSeries(shortRun).slope.every(s => s === undefined)).toBe(true)
  })

  /**
   * Differencing consecutive samples would read a 30 cm barometric wobble over
   * three metres as a 10% ramp. The window is what stops that.
   */
  it('is not fooled by barometric noise on flat ground', () => {
    const noisy = ramp(200, 0, i => ({ elevation: 100 + (i % 2 ? 0.3 : -0.3) }))
    const { slope } = deriveSeries(noisy)

    expect(Math.abs(slope[150]!)).toBeLessThan(0.01)
  })

  it('recovers speed from the trace when no speed channel was recorded', () => {
    const { speed } = deriveSeries(ramp(10, 0))

    expect(speed[5]).toBeCloseTo(3, 6)
  })

  it('prefers a recorded speed over the recovered one', () => {
    const { speed } = deriveSeries(ramp(10, 0, () => ({ speed: 4.2 })))

    expect(speed[5]).toBe(4.2)
  })

  /**
   * A paused activity resumes with one sample carrying an hour of elapsed time.
   * Uncapped, that single sample outvotes the whole outing in every weighted
   * average.
   */
  it('caps the time a single sample can be worth', () => {
    const withPause: Sample[] = [
      { time: 0, distance: 0 },
      { time: 3600, distance: 3 }
    ]

    expect(deriveSeries(withPause).dt[1]).toBe(MAX_SAMPLE_GAP_S)
  })

  it('attributes nothing to a sample that went backwards in time', () => {
    const scrambled: Sample[] = [
      { time: 10, distance: 30 },
      { time: 5, distance: 10 }
    ]

    expect(deriveSeries(scrambled).dt[1]).toBe(0)
    expect(deriveSeries(scrambled).dd[1]).toBe(0)
  })

  it('has nothing to derive from an empty trace', () => {
    expect(deriveSeries([])).toEqual({ slope: [], speed: [], dt: [], dd: [] })
  })
})

describe('evaluateAggregates', () => {
  /** The example the whole feature started from. */
  it('averages a field over the samples inside a slope band', () => {
    const samples = [
      ...ramp(100, 0.05, () => ({ heartRate: 160 })),
      ...ramp(100, 0, () => ({ heartRate: 120 })).map(s => ({
        ...s,
        time: s.time + 100,
        distance: s.distance + 300
      }))
    ]

    const climbHr = define({
      where: [{ field: 'slope', min: 0.02, max: 0.1 }],
      measure: { field: 'heartRate', op: 'avg' }
    })

    const result = evaluateAggregates(samples, [climbHr])
    const average = result['agg-1'].sum / result['agg-1'].weight

    expect(average).toBeCloseTo(160, 6)
  })

  it('keeps sum and weight apart instead of collapsing them to a ratio', () => {
    const result = evaluateAggregates(
      ramp(100, 0, () => ({ heartRate: 150 })),
      [define({ measure: { field: 'heartRate', op: 'avg' } })]
    )

    expect(result['agg-1'].weight).toBeGreaterThan(0)
    expect(result['agg-1'].sum).toBeCloseTo(150 * result['agg-1'].weight, 6)
  })

  /**
   * The reason weighting is not optional: an unweighted mean of per-sample
   * speeds is not the average speed, because the samples do not cover equal
   * time.
   */
  it('weights by time, so a slow crawl does not count as much as it is sampled', () => {
    const samples: Sample[] = [
      { time: 0, distance: 0, speed: 1 },
      { time: 1, distance: 1, speed: 1 },
      { time: 2, distance: 2, speed: 1 },
      { time: 22, distance: 202, speed: 10 }
    ]

    const timeWeighted = evaluateAggregates(samples, [define({ weightBy: 'time' })])['agg-1']
    const unweighted = evaluateAggregates(samples, [define({ weightBy: 'none' })])['agg-1']

    expect(timeWeighted.sum / timeWeighted.weight).toBeGreaterThan(
      unweighted.sum / unweighted.weight
    )
  })

  it('takes the extremum for min and max rather than accumulating', () => {
    const samples = ramp(50, 0, i => ({ heartRate: 100 + i }))

    const max = evaluateAggregates(samples, [
      define({ measure: { field: 'heartRate', op: 'max' } })
    ])['agg-1']
    const min = evaluateAggregates(samples, [
      define({ measure: { field: 'heartRate', op: 'min' } })
    ])['agg-1']

    expect(max.sum).toBe(149)
    expect(min.sum).toBe(101)
  })

  it('combines filters with AND', () => {
    const samples = ramp(200, 0.05, i => ({ heartRate: i < 100 ? 120 : 170 }))

    const result = evaluateAggregates(samples, [
      define({
        where: [
          { field: 'slope', min: 0.02 },
          { field: 'heartRate', min: 150 }
        ],
        measure: { field: 'heartRate', op: 'min' }
      })
    ])

    expect(result['agg-1'].sum).toBe(170)
  })

  it('treats min as inclusive and max as exclusive so bands tile', () => {
    const samples = ramp(50, 0, i => ({ heartRate: 100 + i }))

    const lower = evaluateAggregates(samples, [
      define({
        where: [{ field: 'heartRate', min: 100, max: 120 }],
        measure: { field: 'heartRate', op: 'max' }
      })
    ])['agg-1']
    const upper = evaluateAggregates(samples, [
      define({
        where: [{ field: 'heartRate', min: 120, max: 140 }],
        measure: { field: 'heartRate', op: 'min' }
      })
    ])['agg-1']

    expect(lower.sum).toBe(119)
    expect(upper.sum).toBe(120)
  })

  it('reports nothing for a definition no sample qualified for', () => {
    const result = evaluateAggregates(ramp(200, 0.05), [
      define({ where: [{ field: 'slope', min: 0.5 }] })
    ])

    expect(result['agg-1']).toBeUndefined()
  })

  it('drops an activity that qualified too little to mean anything', () => {
    const samples = ramp(200, 0, i => ({ heartRate: i === 150 ? 190 : 120 }))

    const definition = define({
      where: [{ field: 'heartRate', min: 180 }],
      measure: { field: 'heartRate', op: 'avg' },
      minWeight: 60
    })

    expect(evaluateAggregates(samples, [definition])['agg-1']).toBeUndefined()
  })

  it('ignores a field the samples never carried', () => {
    const result = evaluateAggregates(ramp(200, 0), [
      define({ measure: { field: 'power', op: 'avg' } })
    ])

    expect(result['agg-1']).toBeUndefined()
  })

  it('evaluates several definitions in the same traversal', () => {
    const samples = ramp(200, 0.05, () => ({ heartRate: 150 }))

    const result = evaluateAggregates(samples, [
      define({ id: 'a', measure: { field: 'heartRate', op: 'max' } }),
      define({ id: 'b', measure: { field: 'speed', op: 'avg' } }),
      define({ id: 'c', where: [{ field: 'slope', min: 0.9 }] })
    ])

    expect(result.a.sum).toBe(150)
    expect(result.b.sum / result.b.weight).toBeCloseTo(3, 6)
    expect(result.c).toBeUndefined()
  })

  it('has nothing to say without samples or without definitions', () => {
    expect(evaluateAggregates([], [define()])).toEqual({})
    expect(evaluateAggregates(ramp(10, 0), [])).toEqual({})
  })
})

describe('appliesToSport', () => {
  it('applies everywhere when no sport is named', () => {
    expect(appliesToSport(define(), 'running')).toBe(true)
  })

  it('matches case-insensitively, as legacy activities are stored raw', () => {
    expect(appliesToSport(define({ sports: ['running'] }), 'RUNNING')).toBe(true)
  })

  it('excludes a sport it was not scoped to', () => {
    expect(appliesToSport(define({ sports: ['cycling'] }), 'running')).toBe(false)
  })
})

describe('toMetricValues', () => {
  it('writes two keys per aggregate', () => {
    const values = toMetricValues({ 'agg-1': { sum: 120, weight: 40 } })

    expect(values[aggregateSumKey('agg-1')]).toBe(120)
    expect(values[aggregateWeightKey('agg-1')]).toBe(40)
  })
})

describe('slope, end to end', () => {
  it('turns from computable into measured once a trace is long enough', () => {
    const shortRow = {
      id: 'short',
      sport: 'running',
      startTime: 0,
      indexVersion: 4,
      values: {},
      channels: summarizeSamples(ramp(10, 0.05))
    }
    const longRow = { ...shortRow, id: 'long', channels: summarizeSamples(ramp(300, 0.05)) }

    expect(
      buildCapabilityReport([shortRow]).fields.find(f => f.field === 'slope')!.availability
    ).toBe('computable')

    const measured = buildCapabilityReport([longRow]).fields.find(f => f.field === 'slope')!
    expect(measured.availability).toBe('measured')
    // Bucket-width precision, which is the precision a histogram can honestly
    // offer: the median lands inside the 3-6% band the whole climb sits in.
    expect(measured.p50).toBeGreaterThanOrEqual(0.03)
    expect(measured.p50).toBeLessThan(0.06)
    expect(measured.max).toBeCloseTo(0.05, 6)
  })
})
