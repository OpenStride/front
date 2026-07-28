import { describe, it, expect } from 'vitest'
import { checkActivityContract } from '@/services/activityContract'
import { createActivity, createSwimActivity, createSwimDetails } from '../fixtures/activities'

const fieldsOf = (violations: { field: string }[]) => violations.map(v => v.field)

describe('activity storage contract', () => {
  it('passes a conforming activity', () => {
    expect(checkActivityContract(createActivity())).toEqual([])
    expect(checkActivityContract(createSwimActivity(), createSwimDetails())).toEqual([])
  })

  it('accepts a legacy type that only differs by case', () => {
    // Real databases hold "RUNNING"; it resolves everywhere else, so it is not
    // a contract violation.
    expect(checkActivityContract(createActivity({ type: 'RUNNING' }))).toEqual([])
  })
})

describe('contract — sport vocabulary', () => {
  it('flags a sport that was never mapped', () => {
    // The exact failure ZipImport shipped with.
    const violations = checkActivityContract(createActivity({ type: 'trail running' }))
    expect(fieldsOf(violations)).toContain('type')
    expect(violations[0].message).toMatch(/sportTypes/)
  })

  it('flags a missing sport', () => {
    expect(fieldsOf(checkActivityContract(createActivity({ type: '' })))).toContain('type')
  })
})

describe('contract — SI units', () => {
  it('flags a distance that looks like kilometres', () => {
    // 3000 "units" is fine as metres; 3 million is not, so the bound catches
    // the mistake rather than the value.
    expect(checkActivityContract(createActivity({ distance: 42195 }))).toEqual([])
    expect(fieldsOf(checkActivityContract(createActivity({ distance: 5_000_000 })))).toContain(
      'distance'
    )
  })

  it('flags a negative or non-finite distance', () => {
    expect(fieldsOf(checkActivityContract(createActivity({ distance: -5 })))).toContain('distance')
    expect(fieldsOf(checkActivityContract(createActivity({ distance: NaN })))).toContain('distance')
  })

  it('flags a speed handed over in km/h', () => {
    const details = { id: 'a1', version: 1, lastModified: 0, stats: { averageSpeed: 26.8 * 3.6 } }
    expect(fieldsOf(checkActivityContract(createActivity(), details))).toContain(
      'stats.averageSpeed'
    )
  })

  it('accepts a plausible speed in m/s', () => {
    const details = { id: 'a1', version: 1, lastModified: 0, stats: { averageSpeed: 8.3 } }
    expect(checkActivityContract(createActivity(), details)).toEqual([])
  })
})

describe('contract — measurement registry', () => {
  const withMeasurements = (measurements: Record<string, { value: number; unit: string }>) => ({
    id: 'a1',
    version: 1,
    lastModified: 0,
    measurements
  })

  it('flags a key the registry does not know', () => {
    // The drift the registry exists to prevent: swimming.* vs swim.*
    const violations = checkActivityContract(
      createActivity(),
      withMeasurements({ 'swimming.swolf': { value: 38, unit: 'swolf' } })
    )
    expect(fieldsOf(violations)).toContain('measurements.swimming.swolf')
  })

  it('flags a unit that disagrees with the registry', () => {
    // Storing a pool length in yards would be converted as though it were metres.
    const violations = checkActivityContract(
      createActivity(),
      withMeasurements({ 'swim.poolLength': { value: 25, unit: 'yd' } })
    )
    expect(fieldsOf(violations)).toContain('measurements.swim.poolLength')
    expect(violations[0].message).toMatch(/registry/)
  })

  it('flags a non-numeric value', () => {
    const violations = checkActivityContract(
      createActivity(),
      withMeasurements({ 'swim.swolf': { value: NaN, unit: 'swolf' } })
    )
    expect(fieldsOf(violations)).toContain('measurements.swim.swolf')
  })

  it('reports every violation, not just the first', () => {
    const violations = checkActivityContract(
      createActivity({ type: 'road cycling', distance: -1 }),
      withMeasurements({ 'bogus.key': { value: 1, unit: 'x' } })
    )
    expect(fieldsOf(violations)).toEqual(
      expect.arrayContaining(['type', 'distance', 'measurements.bogus.key'])
    )
  })
})
