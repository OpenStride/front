import { describe, it, expect } from 'vitest'
import { isSportType } from '@/types/sport'
import { getSportProfile } from '@/types/sport'
import { isMeasurementKey, MEASUREMENTS } from '@/types/measurements'
import {
  createActivity,
  createRideActivity,
  createSwimActivity,
  createSwimDetails,
  createGymActivity,
  createLegacyActivity,
  createActivitiesAcrossSports,
  createFriendActivity,
  createPublicActivity
} from '../fixtures/activities'

describe('fixtures use the canonical vocabulary', () => {
  it('gives every fixture a real SportType', () => {
    // The shared fixture used to default to 'run', which is not a SportType: it
    // resolved to the `other` profile, so anything rendering it silently lost
    // its pace. A fixture that lies makes every test built on it lie too.
    const activities = [
      createActivity(),
      createRideActivity(),
      createSwimActivity(),
      createGymActivity(),
      createFriendActivity(),
      createPublicActivity()
    ]
    for (const activity of activities) {
      expect(isSportType(activity.type), `"${activity.type}" is not a SportType`).toBe(true)
    }
  })

  it('exempts the legacy fixture on purpose', () => {
    // This one exists precisely to carry a raw provider string.
    const legacy = createLegacyActivity()
    expect(isSportType(legacy.type)).toBe(false)
    // …and it must still resolve, because real databases hold values like this.
    expect(getSportProfile(legacy.type).primaryMetric).toBe('pace')
  })

  it('only uses measurement keys the registry knows', () => {
    const measurements = createSwimDetails().measurements ?? {}
    expect(Object.keys(measurements).length).toBeGreaterThan(0)

    for (const [key, measurement] of Object.entries(measurements)) {
      expect(isMeasurementKey(key), `"${key}" is not in the registry`).toBe(true)
      // A fixture storing the wrong unit would let a conversion bug pass.
      expect(MEASUREMENTS[key as keyof typeof MEASUREMENTS].unit, `wrong unit for "${key}"`).toBe(
        measurement.unit
      )
    }
  })
})

describe('fixtures cover the presentation shapes', () => {
  it('spans every headline metric', () => {
    const kinds = createActivitiesAcrossSports().map(a => getSportProfile(a.type).primaryMetric)
    expect(new Set(kinds)).toEqual(new Set(['pace', 'speed', 'pace100', 'none']))
  })

  it('covers both distance scales', () => {
    const scales = createActivitiesAcrossSports().map(a => getSportProfile(a.type).distanceScale)
    expect(new Set(scales)).toEqual(new Set(['long', 'short']))
  })

  it('provides an activity with no route, and one with', () => {
    // The card drops its hero on the first and keeps it on the second.
    expect(createSwimActivity().mapPolyline).toEqual([])
    expect(createActivity().mapPolyline?.length).toBeGreaterThan(1)
  })

  it('provides an activity with no distance', () => {
    expect(createGymActivity().distance).toBe(0)
  })
})
