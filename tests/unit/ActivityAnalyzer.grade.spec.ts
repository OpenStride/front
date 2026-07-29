import { describe, it, expect } from 'vitest'
import { ActivityAnalyzer, FLAT_GAIN_PER_KM } from '@/services/ActivityAnalyzer'
import type { Sample } from '@/types/activity'

/**
 * 3 km with a shape we know exactly: km 1 climbs 50 m (+5 %), km 2 is level,
 * km 3 gives the 50 m back (-5 %).
 */
function threeKmProfile(step = 10): Sample[] {
  const samples: Sample[] = []
  for (let d = 0; d <= 3000; d += step) {
    let elevation = 100
    if (d <= 1000) elevation = 100 + (d / 1000) * 50
    else if (d <= 2000) elevation = 150
    else elevation = 150 - ((d - 2000) / 1000) * 50
    samples.push({ time: d / 3, distance: d, elevation, speed: 3, heartRate: 150 })
  }
  return samples
}

/** A flat road loop, with the metre-scale wander a GPS altitude always has */
function flatRoad(total = 5000): Sample[] {
  const samples: Sample[] = []
  for (let d = 0; d <= total; d += 10) {
    samples.push({
      time: d / 3,
      distance: d,
      // Deterministic ripple of ±1 m: noise, not terrain
      elevation: 42 + Math.sin(d / 37),
      speed: 3
    })
  }
  return samples
}

describe('segment grade', () => {
  it('reports the grade of the segment, not of the gap between two averages', () => {
    // The widget used to difference the averaged elevation and distance of
    // consecutive segments. That compares midpoints: it read +0.0 / +2.5 / -2.5
    // for a course that climbs 5 %, levels off, then drops 5 %.
    const segments = new ActivityAnalyzer(threeKmProfile()).sampleAverageByDistance(1000)

    expect(segments).toHaveLength(3)
    expect(segments[0].slope).toBeCloseTo(5, 1)
    expect(segments[1].slope).toBeCloseTo(0, 1)
    expect(segments[2].slope).toBeCloseTo(-5, 1)
  })

  it('measures the first segment too', () => {
    // It was hardcoded to 0, so the opening climb always read flat
    const [first] = new ActivityAnalyzer(threeKmProfile()).sampleAverageByDistance(1000)

    expect(first.slope).toBeCloseTo(5, 1)
  })

  it('carries the length of the segment it stands for', () => {
    const segments = new ActivityAnalyzer(threeKmProfile()).sampleAverageByDistance(1000)

    for (const segment of segments) {
      expect(segment.segmentDistance).toBe(1000)
    }
  })

  it('leaves the grade undefined rather than inventing one without elevation', () => {
    const samples = threeKmProfile().map(({ elevation: _elevation, ...rest }) => rest)

    const segments = new ActivityAnalyzer(samples).sampleAverageByDistance(1000)

    expect(segments.every(s => s.slope === undefined)).toBe(true)
  })

  it('keeps a trailing partial lap sane', () => {
    // distance is the lap end while elevation is the lap mean, which used to
    // produce -252 % on the few metres recorded after the last lap
    const samples = threeKmProfile()
    const laps = [{ time: 1000 / 3 }, { time: 2000 / 3 }, { time: 2990 / 3 }]

    const segments = new ActivityAnalyzer(samples).sampleByLaps(laps)

    for (const segment of segments) {
      expect(Math.abs(segment.slope ?? 0)).toBeLessThan(20)
    }
  })
})

describe('elevation profile', () => {
  it('calls a rolling course what it is', () => {
    const profile = new ActivityAnalyzer(threeKmProfile()).elevationProfile()

    // The dead band only banks a move once it exceeds the threshold, so the tail
    // of a climb — up to one threshold of it — is never counted. 48 m for a 50 m
    // hill is the accumulator working, not drifting.
    expect(profile.gain).toBeGreaterThan(50 - 3)
    expect(profile.gain).toBeLessThanOrEqual(50)
    expect(profile.loss).toBeGreaterThan(50 - 3)
    expect(profile.loss).toBeLessThanOrEqual(50)
    expect(profile.gainPerKm).toBeGreaterThan(FLAT_GAIN_PER_KM)
    expect(profile.isFlat).toBe(false)
  })

  it('is not fooled by GPS altitude wander on a flat road', () => {
    const profile = new ActivityAnalyzer(flatRoad()).elevationProfile()

    expect(profile.gainPerKm).toBeLessThan(FLAT_GAIN_PER_KM)
    expect(profile.isFlat).toBe(true)
  })

  it('treats a track with no elevation as nothing to show', () => {
    const samples = flatRoad().map(({ elevation: _elevation, ...rest }) => rest)

    const profile = new ActivityAnalyzer(samples).elevationProfile()

    expect(profile.hasElevation).toBe(false)
    expect(profile.isFlat).toBe(true)
  })

  it('does not read the sport, only the ground', () => {
    // A watch filing a trail as a plain run must not hide the climbing
    const trailFiledAsRun = new ActivityAnalyzer(threeKmProfile()).elevationProfile()

    expect(trailFiledAsRun.isFlat).toBe(false)
  })
})

/** A watch that thins its samples: gaps of 15 to 35 m, not a tidy 10 */
function coarseTrack(total = 5200): Sample[] {
  const samples: Sample[] = []
  let d = 0
  let i = 0
  while (d <= total) {
    samples.push({ time: d / 3, distance: d, elevation: 100 + d * 0.02, speed: 3, heartRate: 150 })
    d += 15 + ((i++ * 7) % 21)
  }
  return samples
}

describe('split boundaries', () => {
  it('cuts exactly on the mark whatever the sampling', () => {
    // Cutting at the first sample past the threshold gave 1005, 1012, 990… —
    // splits of different lengths, which cannot be compared to each other
    const segments = new ActivityAnalyzer(coarseTrack()).sampleAverageByDistance(1000)

    for (const segment of segments.slice(0, -1)) {
      expect(segment.segmentDistance).toBe(1000)
    }
  })

  it('holds on a short granularity too', () => {
    const segments = new ActivityAnalyzer(coarseTrack()).sampleAverageByDistance(200)

    for (const segment of segments.slice(0, -1)) {
      expect(segment.segmentDistance).toBe(200)
    }
  })

  it('keeps the leftover as the real distance it is', () => {
    const segments = new ActivityAnalyzer(coarseTrack(5200)).sampleAverageByDistance(1000)
    const last = segments[segments.length - 1]

    expect(last.segmentDistance).toBeGreaterThan(0)
    expect(last.segmentDistance).toBeLessThan(1000)
    const total = segments.reduce((sum, s) => sum + (s.segmentDistance ?? 0), 0)
    expect(total).toBeCloseTo(coarseTrack(5200).at(-1)!.distance!, 0)
  })

  it('splits a long recording gap into whole marks', () => {
    // Smart recording can leave kilometres between two samples
    const sparse: Sample[] = [
      { time: 0, distance: 0, elevation: 100, speed: 3 },
      { time: 900, distance: 2700, elevation: 154, speed: 3 }
    ]

    const segments = new ActivityAnalyzer(sparse).sampleAverageByDistance(1000)

    expect(segments.map(s => s.segmentDistance)).toEqual([1000, 1000, 700])
  })

  it('adds no empty split when the track ends on a mark', () => {
    const samples: Sample[] = []
    for (let d = 0; d <= 2000; d += 10) {
      samples.push({ time: d / 3, distance: d, elevation: 100, speed: 3 })
    }

    const segments = new ActivityAnalyzer(samples).sampleAverageByDistance(1000)

    expect(segments).toHaveLength(2)
    expect(segments.every(s => (s.segmentDistance ?? 0) > 0)).toBe(true)
  })

  it('still reads the grade correctly on exact splits', () => {
    const segments = new ActivityAnalyzer(threeKmProfile(23)).sampleAverageByDistance(1000)

    expect(segments[0].slope).toBeCloseTo(5, 1)
    expect(segments[1].slope).toBeCloseTo(0, 1)
    expect(segments[2].slope).toBeCloseTo(-5, 1)
  })
})
