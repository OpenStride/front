import { describe, it, expect } from 'vitest'
import { MAX_SHARED_POINTS, readSharing, shareSamples } from '@/types/sharing'
import type { Sample } from '@/types/activity'

const samples = (n: number): Sample[] =>
  Array.from({ length: n }, (_, i) => ({
    time: i,
    distance: i * 3.04,
    lat: 45 + i / 1e4,
    lng: 4 + i / 1e4,
    elevation: 200.123,
    heartRate: 150,
    cadence: 172,
    speed: 3.0456
  }))

describe('sharing settings', () => {
  it('reads back whole, whatever was stored', () => {
    expect(readSharing(undefined)).toEqual({
      map: true,
      title: true,
      time: true,
      figures: false,
      charts: []
    })
    expect(readSharing({ map: false, charts: ['heartRate', 'bogus'] })).toMatchObject({
      map: false,
      title: true,
      charts: ['heartRate']
    })
  })
})

describe('shareSamples', () => {
  it('sends nothing without a chart', () => {
    expect(shareSamples(samples(10), [])).toEqual([])
  })

  it('keeps only what the shared charts read, rounded, and never a position', () => {
    const [first] = shareSamples(samples(10), ['heartRate', 'pace'])
    expect(first).toEqual({ time: 0, heartRate: 150, speed: 3.05, distance: 0, elevation: 200.1 })
    expect(shareSamples(samples(10), ['pace'])[1]).not.toHaveProperty('lat')
  })

  it('lightens a long outing to a few hundred points', () => {
    const out = shareSamples(samples(7200), ['cadence'])
    expect(out.length).toBeLessThanOrEqual(MAX_SHARED_POINTS)
    expect(out.length).toBeGreaterThan(MAX_SHARED_POINTS / 2)
    expect(out[1]).toEqual({ time: 18, cadence: 172 })
  })
})
