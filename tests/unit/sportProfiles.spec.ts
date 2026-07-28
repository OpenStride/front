import { describe, it, expect } from 'vitest'
import {
  SPORT_TYPES,
  SPORT_FAMILIES,
  SPORT_FAMILY,
  getSportProfile,
  type SportFamily
} from '@/types/sport'

describe('sport families', () => {
  it('assigns a family to every SportType', () => {
    for (const slug of SPORT_TYPES) {
      expect(SPORT_FAMILY[slug], `missing family for "${slug}"`).toBeTruthy()
    }
  })

  it('only uses declared families', () => {
    const known = new Set<string>(SPORT_FAMILIES)
    for (const slug of SPORT_TYPES) {
      expect(known.has(SPORT_FAMILY[slug]), `unknown family for "${slug}"`).toBe(true)
    }
  })

  it('has no orphan family (each one is actually used)', () => {
    const used = new Set<SportFamily>(Object.values(SPORT_FAMILY))
    for (const family of SPORT_FAMILIES) {
      expect(used.has(family), `family "${family}" is declared but unused`).toBe(true)
    }
  })
})

describe('sport profiles', () => {
  it('gives every SportType a complete profile', () => {
    for (const slug of SPORT_TYPES) {
      const profile = getSportProfile(slug)
      expect(profile.primaryMetric, `no primaryMetric for "${slug}"`).toBeTruthy()
      expect(profile.distanceScale, `no distanceScale for "${slug}"`).toBeTruthy()
    }
  })

  it('falls back to the neutral profile for an unknown slug', () => {
    expect(getSportProfile('not_a_sport')).toEqual({
      primaryMetric: 'none',
      distanceScale: 'long'
    })
  })

  it('paces foot sports and speeds wheeled ones', () => {
    expect(getSportProfile('running').primaryMetric).toBe('pace')
    expect(getSportProfile('trail_running').primaryMetric).toBe('pace')
    expect(getSportProfile('hiking').primaryMetric).toBe('pace')
    expect(getSportProfile('cycling').primaryMetric).toBe('speed')
    expect(getSportProfile('mountain_biking').primaryMetric).toBe('speed')
  })

  it('reads pool swims per 100 and in short distances', () => {
    const pool = getSportProfile('pool_swimming')
    expect(pool.primaryMetric).toBe('pace100')
    expect(pool.distanceScale).toBe('short')
  })

  it('keeps open water on the long scale while still pacing per 100', () => {
    // Same family as pool swimming, different course — this is why per-slug
    // overrides exist.
    const open = getSportProfile('open_water_swimming')
    expect(open.primaryMetric).toBe('pace100')
    expect(open.distanceScale).toBe('long')
  })

  it('drops the accent metric where speed is meaningless', () => {
    expect(getSportProfile('yoga').primaryMetric).toBe('none')
    expect(getSportProfile('strength_training').primaryMetric).toBe('none')
  })

  it('no longer misclassifies sports the old regex caught by name', () => {
    // The previous implementation tested /cycl|bike|velo|vtt|ride/ against the
    // raw slug, so anything else — swimming included — got min/km.
    expect(getSportProfile('swimming').primaryMetric).not.toBe('pace')
    expect(getSportProfile('e_biking').primaryMetric).toBe('speed')
    expect(getSportProfile('indoor_cycling').primaryMetric).toBe('speed')
  })
})

describe('sport profiles — legacy data', () => {
  it('recognises raw provider casing, as the rest of the app does', () => {
    // Activities predating the canonical vocabulary carry strings like "RUNNING".
    // An exact lookup would drop them to `other` and silently remove their pace.
    expect(getSportProfile('RUNNING').primaryMetric).toBe('pace')
    expect(getSportProfile('Cycling').primaryMetric).toBe('speed')
    expect(getSportProfile(' pool_swimming ').primaryMetric).toBe('pace100')
  })

  it('survives an empty or missing type', () => {
    expect(getSportProfile('').primaryMetric).toBe('none')
    expect(() => getSportProfile(undefined as unknown as string)).not.toThrow()
  })
})
