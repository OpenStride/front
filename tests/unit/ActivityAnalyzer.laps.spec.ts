import { describe, it, expect } from 'vitest'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'
import { makeSamples } from './factories'

describe('ActivityAnalyzer.sampleByLaps', () => {
  it('retourne vide si pas de laps', () => {
    const a = new ActivityAnalyzer(makeSamples({ km: 1 }))
    expect(a.sampleByLaps([])).toEqual([])
  })
  it('segmente selon les temps de laps', () => {
    const samples = makeSamples({ km: 2 })
    // temps total ~600s ; créons deux laps à 300s et 600s
    const a = new ActivityAnalyzer(samples)
    const laps = [{ time: 300 }, { time: 600 }]
    const segs = a.sampleByLaps(laps)
    expect(segs.length).toBeGreaterThanOrEqual(2)
    // Le dernier segment leftover est possible => >=2
  })
})
