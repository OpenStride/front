import { describe, it, expect } from 'vitest'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'
import { makeSamples } from './factories'

// Bench léger (skip) pour surveiller régression perf bestSegments
describe.skip('Performance bestSegments', () => {
  it('analyse 10km en temps raisonnable', () => {
    const samples = makeSamples({ km: 10 })
    const a = new ActivityAnalyzer(samples)
    const t0 = performance.now()
    const res = a.bestSegments([1000, 5000, 10000])
    const dt = performance.now() - t0
    expect(res[1000]).not.toBeNull()
    // seuil arbitraire 200ms
    expect(dt).toBeLessThan(200)
  })
})
