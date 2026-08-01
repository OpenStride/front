import { describe, it, expect } from 'vitest'
import { ACTIVITY_SOURCES, isActivitySource, readActivitySource } from '@/types/activitySources'
import { createActivity, createActivityDetails } from '../fixtures/activities'

describe('activity sources — the vocabulary metrics are built on', () => {
  const activity = createActivity({ distance: 10000, duration: 3000 })
  const details = createActivityDetails('activity-1')

  it('reads a top-level activity field', () => {
    expect(readActivitySource('distance', activity, details)).toBe(10000)
    expect(readActivitySource('duration', activity, details)).toBe(3000)
  })

  it('reads a stat off the details', () => {
    const withStats = { ...details, stats: { ...details.stats, totalAscent: 430 } }
    expect(readActivitySource('stats.totalAscent', activity, withStats)).toBe(430)
  })

  it('returns undefined for a name no longer in the registry', () => {
    // An aggregation config is persisted, so it can outlive the field it names.
    // Skipping beats aggregating a NaN into a stored total.
    expect(readActivitySource('stats.somethingRemoved', activity, details)).toBeUndefined()
    expect(isActivitySource('stats.somethingRemoved')).toBe(false)
  })

  it('returns undefined rather than a non-finite number', () => {
    const broken = { ...details, stats: { totalAscent: Number.NaN } }
    expect(readActivitySource('stats.totalAscent', activity, broken)).toBeUndefined()
  })

  it('survives details being absent entirely', () => {
    // The feed path aggregates before details are loaded.
    expect(readActivitySource('stats.calories', activity, undefined)).toBeUndefined()
    expect(readActivitySource('distance', activity, undefined)).toBe(10000)
  })

  it('names only fields that exist on the real types', () => {
    // The whole point of accessors over string paths: this list cannot drift
    // from Activity/ActivityDetails without the file failing to compile.
    const full = {
      ...details,
      stats: {
        averageSpeed: 3,
        maxSpeed: 5,
        averageHeartRate: 140,
        maxHeartRate: 180,
        averageCadence: 170,
        totalAscent: 100,
        totalDescent: 90,
        calories: 500
      }
    }
    for (const ref of Object.keys(ACTIVITY_SOURCES)) {
      expect(readActivitySource(ref, activity, full)).toBeTypeOf('number')
    }
  })
})
