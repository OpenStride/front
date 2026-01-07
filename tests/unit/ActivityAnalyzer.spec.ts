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
