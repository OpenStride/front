import { describe, it, expect } from 'vitest'
import { MAX_SHARED_POINTS, readSharing, shareSamples, trimTrack } from '@/types/sharing'
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
      privacyZone: 0,
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

describe('trimTrack — the privacy zone', () => {
  // ~111 m per point, due north: 21 points, 2.2 km
  const track = Array.from({ length: 21 }, (_, i) => [45 + i * 0.001, 4] as [number, number])

  it('withholds the first and last metres, measured along the track', () => {
    const kept = trimTrack(track, 500)!
    expect(kept[0][0]).toBeCloseTo(45.005, 6)
    expect(kept[kept.length - 1][0]).toBeCloseTo(45.015, 6)
    // Nothing of either end survives
    expect(kept.some(p => p[0] < 45.0045 || p[0] > 45.0155)).toBe(false)
  })

  it('shares nothing of a track too short to keep a middle', () => {
    expect(trimTrack(track, 1500)).toBeUndefined()
  })

  it('leaves the track whole without a zone', () => {
    expect(trimTrack(track, 0)).toBe(track)
  })

  it('reads an unknown zone back as none', () => {
    expect(readSharing({ privacyZone: 123 }).privacyZone).toBe(0)
    expect(readSharing({ privacyZone: 500 }).privacyZone).toBe(500)
  })
})
