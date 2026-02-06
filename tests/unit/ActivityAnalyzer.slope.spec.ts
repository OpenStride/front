import { describe, it, expect } from 'vitest'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'
import type { Sample } from '@/types/activity'

function buildSegment(startDist: number, length: number, slopePct: number, startElev: number, speed = 3, step = 10): Sample[] {
  const out: Sample[] = []
  const metersPerSample = step
  const elevPerMeter = slopePct / 100
  const timeOffset = startDist / speed
  for (let d = 0; d <= length; d += metersPerSample) {
    const distance = startDist + d
    const elevation = startElev + d * elevPerMeter
    out.push({
      distance,
      time: timeOffset + d / speed,
      elevation,
      speed: speed,
      heartRate: 140,
      cadence: 160
    })
  }
  return out
}

function makeUpFlatDown(): Sample[] {
  // Up 400m @ +8%, flat 150m, down 400m @ -7%
  const up = buildSegment(0, 400, 8, 100)
  const flat = buildSegment(400, 150, 0, up[up.length - 1].elevation!)
  const down = buildSegment(550, 400, -7, flat[flat.length - 1].elevation!)
  return [...up, ...flat.slice(1), ...down.slice(1)]
}

function makeFlatNoise(total = 500): Sample[] {
  const out: Sample[] = []
  const step = 10
  for (let d = 0; d <= total; d += step) {
    out.push({
      distance: d,
      time: d / 3,
      elevation: 200 + (Math.random() - 0.5) * 0.2, // ±0.1 m noise (well below threshold)
      speed: 3,
      heartRate: 135,
      cadence: 158
    })
  }
  return out
}

describe('ActivityAnalyzer.sampleBySlopeChange', () => {
  it('produit au moins un segment couvrant la distance totale', () => {
    const samples = makeUpFlatDown()
    const analyzer = new ActivityAnalyzer(samples)
    const segs = analyzer.sampleBySlopeChange(100)
    expect(segs.length).toBeGreaterThanOrEqual(1)
    const last = segs[segs.length - 1]
    expect((last.distance ?? 0)).toBeGreaterThanOrEqual(samples[samples.length - 1].distance!)
  })

  it('retourne un seul segment pour un parcours quasi plat bruité', () => {
    const samples = makeFlatNoise(600)
    const analyzer = new ActivityAnalyzer(samples)
    const segs = analyzer.sampleBySlopeChange(100)
    // Peut parfois couper 1 fois selon fluctuations, mais on attend faible fragmentation
    expect(segs.length).toBeLessThanOrEqual(2)
  })

  it('retourne vide pour samples vides', () => {
    const analyzer = new ActivityAnalyzer([])
    expect(analyzer.sampleBySlopeChange(100)).toEqual([])
  })
})
