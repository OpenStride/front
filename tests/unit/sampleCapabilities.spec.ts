import { describe, it, expect } from 'vitest'
import type { Sample } from '@/types/activity'
import {
  availabilityOf,
  emptySummary,
  mergeSummary,
  quantile,
  summarizeSamples
} from '@/types/sampleFields'
import { buildCapabilityReport } from '@/composables/useSampleCapabilities'
import type { ActivityMetricsRow } from '@/composables/useActivityMetricsIndex'

function sample(index: number, extra: Partial<Sample> = {}): Sample {
  return { time: index, distance: index * 3, ...extra }
}

function row(id: string, sport: string, samples: Sample[]): ActivityMetricsRow {
  return {
    id,
    sport,
    startTime: 0,
    indexVersion: 3,
    values: {},
    ...(samples.length ? { channels: summarizeSamples(samples) } : {})
  }
}

describe('summarizeSamples', () => {
  it('reports only the channels the samples carried', () => {
    const summary = summarizeSamples([
      sample(0, { heartRate: 120, elevation: 100 }),
      sample(1, { heartRate: 130, elevation: 110 })
    ])

    // `distance` rides along: the helper writes one, and presence is tracked
    // for every channel even where no histogram is kept. `speed` too — it is
    // recovered from the trace when the samples carry no speed channel.
    expect(Object.keys(summary).sort()).toEqual(['distance', 'elevation', 'heartRate', 'speed'])
  })

  it('keeps the recorded speed rather than recomputing one', () => {
    const summary = summarizeSamples([sample(0, { speed: 4 }), sample(1, { speed: 5 })])

    // The helper's distance trace would derive 3 m/s; the channel wins.
    expect(summary.speed.min).toBe(4)
    expect(summary.speed.max).toBe(5)
  })

  it('tracks presence without buckets for a channel that has no scale', () => {
    const summary = summarizeSamples([sample(0), sample(1)])

    expect(summary.distance.n).toBe(2)
    expect(summary.distance.buckets).toEqual([])
  })

  /**
   * "No power meter" and "rode at zero watts" are different statements, and a
   * picker that cannot tell them apart offers a filter matching nothing.
   */
  it('leaves an absent channel out rather than summarizing it as zero', () => {
    const summary = summarizeSamples([sample(0, { heartRate: 120 })])

    expect(summary.power).toBeUndefined()
    expect(summary.heartRate.n).toBe(1)
  })

  it('ignores non-finite readings', () => {
    const summary = summarizeSamples([
      sample(0, { cadence: 80 }),
      sample(1, { cadence: NaN }),
      sample(2, { cadence: Infinity })
    ])

    expect(summary.cadence.n).toBe(1)
    expect(summary.cadence.max).toBe(80)
  })

  it('records the observed extremes and total', () => {
    const summary = summarizeSamples([
      sample(0, { heartRate: 100 }),
      sample(1, { heartRate: 150 }),
      sample(2, { heartRate: 140 })
    ])

    expect(summary.heartRate.min).toBe(100)
    expect(summary.heartRate.max).toBe(150)
    expect(summary.heartRate.sum).toBe(390)
    expect(summary.heartRate.n).toBe(3)
  })

  it('returns nothing at all for sampleless input', () => {
    expect(summarizeSamples([])).toEqual({})
  })
})

describe('mergeSummary', () => {
  it('adds counts and widens the range', () => {
    const a = summarizeSamples([sample(0, { heartRate: 100 })])
    const b = summarizeSamples([sample(0, { heartRate: 180 })])

    const merged = mergeSummary(a.heartRate, b.heartRate)

    expect(merged.n).toBe(2)
    expect(merged.min).toBe(100)
    expect(merged.max).toBe(180)
    expect(merged.buckets.reduce((s, c) => s + c, 0)).toBe(2)
  })

  it('leaves an empty summary unchanged in meaning', () => {
    const real = summarizeSamples([sample(0, { power: 200 })]).power
    const merged = mergeSummary(emptySummary('power'), real)

    expect(merged.n).toBe(1)
    expect(merged.min).toBe(200)
  })
})

describe('quantile', () => {
  it('lands inside the observed range', () => {
    const samples = Array.from({ length: 100 }, (_, i) => sample(i, { heartRate: 100 + i }))
    const summary = summarizeSamples(samples).heartRate

    const median = quantile(summary, 'heartRate', 0.5)

    expect(median).toBeGreaterThanOrEqual(100)
    expect(median).toBeLessThanOrEqual(199)
  })

  it('orders the quantiles it reports', () => {
    const samples = Array.from({ length: 200 }, (_, i) => sample(i, { heartRate: 90 + (i % 100) }))
    const summary = summarizeSamples(samples).heartRate

    const p05 = quantile(summary, 'heartRate', 0.05)!
    const p50 = quantile(summary, 'heartRate', 0.5)!
    const p95 = quantile(summary, 'heartRate', 0.95)!

    expect(p05).toBeLessThanOrEqual(p50)
    expect(p50).toBeLessThanOrEqual(p95)
  })

  /**
   * A glitch reporting 400 km/h must not drag the suggested band with it: it
   * lands in the open end bucket and stops counting for the rest of the scale.
   */
  it('is not dragged by a single outlier', () => {
    const clean = Array.from({ length: 200 }, (_, i) => sample(i, { speed: 3 + (i % 10) * 0.05 }))
    const withGlitch = [...clean, sample(999, { speed: 110 })]

    const a = quantile(summarizeSamples(clean).speed, 'speed', 0.5)!
    const b = quantile(summarizeSamples(withGlitch).speed, 'speed', 0.5)!

    expect(Math.abs(a - b)).toBeLessThan(0.5)
  })

  it('has nothing to say about an empty summary', () => {
    expect(quantile(emptySummary('power'), 'power', 0.5)).toBeUndefined()
  })
})

describe('availabilityOf', () => {
  it('calls a recorded channel measured', () => {
    expect(availabilityOf('heartRate', new Set(['heartRate']))).toBe('measured')
  })

  it('calls slope computable wherever elevation and distance both exist', () => {
    expect(availabilityOf('slope', new Set(['elevation', 'distance']))).toBe('computable')
  })

  it('refuses slope when only one of the two is there', () => {
    expect(availabilityOf('slope', new Set(['elevation']))).toBe('absent')
    expect(availabilityOf('slope', new Set(['distance']))).toBe('absent')
  })

  it('recovers speed from a distance trace when no speed channel was recorded', () => {
    expect(availabilityOf('speed', new Set(['distance']))).toBe('computable')
  })

  it('prefers the recorded channel over the derivation', () => {
    expect(availabilityOf('speed', new Set(['speed', 'distance']))).toBe('measured')
  })

  it('calls an unrecorded, underivable field absent', () => {
    expect(availabilityOf('power', new Set(['heartRate']))).toBe('absent')
  })
})

describe('buildCapabilityReport', () => {
  const rows = [
    row('a', 'running', [
      sample(0, { heartRate: 140, elevation: 100 }),
      sample(1, { heartRate: 150, elevation: 120 })
    ]),
    row('b', 'running', [sample(0, { heartRate: 160, elevation: 200 })]),
    row('c', 'cycling', [sample(0, { power: 220, heartRate: 130, elevation: 50 })])
  ]

  it('counts how many activities carry each field', () => {
    const heartRate = buildCapabilityReport(rows).fields.find(f => f.field === 'heartRate')!

    expect(heartRate.availability).toBe('measured')
    expect(heartRate.activityCount).toBe(3)
    expect(heartRate.sampleCount).toBe(4)
    expect(heartRate.activityRatio).toBe(1)
  })

  /**
   * The heart of the ask: power exists in this library, but only on the bike.
   * Offering it on a running aggregate would produce a filter matching nothing.
   */
  it('scopes availability to the sport', () => {
    const running = buildCapabilityReport(rows, 'running')
    const cycling = buildCapabilityReport(rows, 'cycling')

    expect(running.fields.find(f => f.field === 'power')?.availability).toBe('absent')
    expect(cycling.fields.find(f => f.field === 'power')?.availability).toBe('measured')
  })

  it('matches the sport case-insensitively, as legacy activities are stored raw', () => {
    const upper = buildCapabilityReport(
      [row('d', 'running', [sample(0, { power: 200 })])],
      'RUNNING'
    )

    expect(upper.activityCount).toBe(1)
    expect(upper.fields.find(f => f.field === 'power')?.availability).toBe('measured')
  })

  it('reports a distribution to place a band with', () => {
    const heartRate = buildCapabilityReport(rows).fields.find(f => f.field === 'heartRate')!

    expect(heartRate.min).toBe(130)
    expect(heartRate.max).toBe(160)
    expect(heartRate.mean).toBeCloseTo(145, 5)
    expect(heartRate.p50).toBeGreaterThanOrEqual(130)
    expect(heartRate.p50).toBeLessThanOrEqual(160)
  })

  it('offers a computable field without inventing numbers for it', () => {
    const slope = buildCapabilityReport(rows).fields.find(f => f.field === 'slope')!

    expect(slope.availability).toBe('computable')
    expect(slope.min).toBeUndefined()
    expect(slope.p50).toBeUndefined()
  })

  it('lists measured fields before computable ones, and absent ones last', () => {
    const order = buildCapabilityReport(rows).fields.map(f => f.availability)
    const rank = { measured: 0, computable: 1, absent: 2 } as const

    expect(order.map(a => rank[a])).toEqual([...order.map(a => rank[a])].sort((x, y) => x - y))
  })

  it('lists the sports present so a picker can be built from real data', () => {
    expect(buildCapabilityReport(rows).sports).toEqual(['cycling', 'running'])
  })

  it('reports nothing available for a library that was never indexed', () => {
    const report = buildCapabilityReport([])

    expect(report.activityCount).toBe(0)
    expect(report.fields.every(f => f.availability === 'absent')).toBe(true)
  })

  it('survives a row indexed before channels existed', () => {
    const legacy: ActivityMetricsRow = {
      id: 'old',
      sport: 'running',
      startTime: 0,
      indexVersion: 2,
      values: { calories: 300 }
    }

    const report = buildCapabilityReport([legacy])

    expect(report.activityCount).toBe(1)
    expect(report.fields.every(f => f.availability === 'absent')).toBe(true)
  })
})
