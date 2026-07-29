import { describe, it, expect } from 'vitest'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'
import { makeSamples } from './factories'

function analyzerFor(km: number) {
  // ajoute distance cumulative déjà dans sample factory
  return new ActivityAnalyzer(makeSamples({ km }))
}

describe('ActivityAnalyzer.sampleAverageByDistance', () => {
  it('retourne un tableau vide si aucun sample', () => {
    const a = new ActivityAnalyzer([])
    expect(a.sampleAverageByDistance(1000)).toEqual([])
  })

  it('segmente sur des pas de 1km', () => {
    const a = analyzerFor(2.3)
    const segs = a.sampleAverageByDistance(1000)
    expect(segs.length).toBeGreaterThanOrEqual(2)
    // dernier segment partiel < 1000 m
    const last = segs[segs.length - 1]
    expect(last.distance!).toBeGreaterThan(2000 - 1) // cumul distance ~ >= 2000
  })
})

describe('ActivityAnalyzer.bestSegments', () => {
  it('retourne null pour chaque distance si échantillons vides', () => {
    const a = new ActivityAnalyzer([])
    const res = a.bestSegments([1000, 5000])
    expect(res[1000]).toBeNull()
    expect(res[5000]).toBeNull()
  })

  it('trouve un segment 1k dans une activité de 3k', () => {
    const a = analyzerFor(3)
    const res = a.bestSegments([1000])
    expect(res[1000]).not.toBeNull()
    expect(res[1000]!.duration).toBeGreaterThan(0)
  })
})

describe('ActivityAnalyzer.sampleBySlopeChange', () => {
  it('retourne au moins un segment pour une activité simple', () => {
    const a = analyzerFor(2)
    const segs = a.sampleBySlopeChange(200)
    expect(segs.length).toBeGreaterThan(0)
  })
})

describe('elevationChange', () => {
  const withElevations = (elevations: number[]) =>
    new ActivityAnalyzer(elevations.map((elevation, i) => ({ time: i, distance: i * 10, elevation })))

  it('sums a clean climb and descent', () => {
    // up 100, down 60
    expect(withElevations([0, 50, 100, 70, 40]).elevationChange()).toEqual({
      ascent: 100,
      descent: 60
    })
  })

  it('ignores the jitter a barometer produces at rest', () => {
    // Ten minutes standing still, ±1 m of noise. Summing every delta would
    // invent tens of metres of climb on a flat activity.
    const noise = Array.from({ length: 200 }, (_, i) => 100 + (i % 2 ? 1 : -1))
    const { ascent, descent } = withElevations(noise).elevationChange()
    expect(ascent).toBe(0)
    expect(descent).toBe(0)
  })

  it('still counts real movement hidden in noisy data', () => {
    const climb = Array.from({ length: 100 }, (_, i) => i * 3 + (i % 2 ? 1 : -1))
    expect(withElevations(climb).elevationChange().ascent).toBeGreaterThan(280)
  })

  it('reads a ski day as almost all descent', () => {
    // Lifts are not recorded as climbing effort in this synthetic case: the
    // shape is what matters — thousands down, little up.
    const runs = [1800, 1200, 1750, 1150, 1700, 1100]
    const { ascent, descent } = withElevations(runs).elevationChange()
    expect(descent).toBeGreaterThan(ascent)
    expect(descent).toBe(1800)
  })

  it('survives missing and non-finite elevations', () => {
    const analyzer = new ActivityAnalyzer([
      { time: 0, elevation: 100 },
      { time: 1 },
      { time: 2, elevation: NaN },
      { time: 3, elevation: 150 }
    ])
    expect(analyzer.elevationChange()).toEqual({ ascent: 50, descent: 0 })
  })

  it('returns zeros with no samples at all', () => {
    expect(new ActivityAnalyzer([]).elevationChange()).toEqual({ ascent: 0, descent: 0 })
  })
})
