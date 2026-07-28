import { describe, it, expect } from 'vitest'
import { primaryMetricSpec, distanceDimension } from '@/utils/activityMetrics'

describe('primaryMetricSpec', () => {
  it('paces a run in seconds per metre', () => {
    // 10 km in 50 min → 3.333 m/s → 0.3 s/m
    const spec = primaryMetricSpec('running', { distance: 10000, duration: 3000 })
    expect(spec?.dimension).toBe('pace')
    expect(spec?.si).toBeCloseTo(0.3, 5)
  })

  it('speeds a ride in metres per second', () => {
    const spec = primaryMetricSpec('cycling', { distance: 30000, duration: 3600 })
    expect(spec?.dimension).toBe('speed')
    expect(spec?.si).toBeCloseTo(30000 / 3600, 5)
  })

  it('paces a pool swim per 100', () => {
    const spec = primaryMetricSpec('pool_swimming', { distance: 1500, duration: 1800 })
    expect(spec?.dimension).toBe('pace100')
    expect(spec?.si).toBeCloseTo(1.2, 5)
  })

  it('returns null where speed is meaningless, so callers can drop the slot', () => {
    expect(primaryMetricSpec('yoga', { distance: 0, duration: 3600 })).toBeNull()
    expect(primaryMetricSpec('strength_training', { duration: 1800 })).toBeNull()
  })

  it('prefers a provider average over the overall figures', () => {
    // The two call sites disagreed on this before: one passed m/s, the other
    // derived s/m. Both conventions now land here.
    const spec = primaryMetricSpec('cycling', { speed: 8, distance: 30000, duration: 3600 })
    expect(spec?.si).toBe(8)
  })

  it('falls back to distance over duration when no average is given', () => {
    const spec = primaryMetricSpec('cycling', { distance: 20000, duration: 2000 })
    expect(spec?.si).toBe(10)
  })

  it('yields a non-finite value rather than Infinity for an empty activity', () => {
    const spec = primaryMetricSpec('running', { distance: 0, duration: 1800 })
    expect(spec).not.toBeNull()
    expect(Number.isFinite(spec!.si)).toBe(false)
  })

  it('ignores a zero or negative provider average', () => {
    const spec = primaryMetricSpec('running', { speed: 0, distance: 5000, duration: 1500 })
    expect(spec?.si).toBeCloseTo(0.3, 5)
  })

  it('treats an unknown sport as having no headline metric', () => {
    expect(primaryMetricSpec('quidditch', { distance: 1000, duration: 600 })).toBeNull()
  })
})

describe('distanceDimension', () => {
  it('reads swims short and everything else long', () => {
    expect(distanceDimension('pool_swimming')).toBe('distanceShort')
    expect(distanceDimension('running')).toBe('distance')
    expect(distanceDimension('cycling')).toBe('distance')
    // Open water covers real ground, so it stays on the long scale.
    expect(distanceDimension('open_water_swimming')).toBe('distance')
  })
})
