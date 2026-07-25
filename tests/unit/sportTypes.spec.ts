import { describe, it, expect } from 'vitest'
import { SPORT_TYPES, isSportType } from '@/types/sport'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import { mapGarminSport } from '../../plugins/data-providers/GarminProvider/client/sportTypes'
import { mapStravaSport } from '../../plugins/data-providers/StravaProvider/client/sportTypes'

const enSports = (en as { sports: Record<string, string> }).sports
const frSports = (fr as { sports: Record<string, string> }).sports

describe('SportType canonical vocabulary', () => {
  it('has an i18n label for every SportType in every locale', () => {
    for (const slug of SPORT_TYPES) {
      expect(enSports[slug], `missing en label for "${slug}"`).toBeTruthy()
      expect(frSports[slug], `missing fr label for "${slug}"`).toBeTruthy()
    }
  })

  it('has no orphan i18n sport keys (locale keys all map to a SportType)', () => {
    for (const key of Object.keys(enSports)) {
      expect(isSportType(key), `en has orphan sport key "${key}"`).toBe(true)
    }
    for (const key of Object.keys(frSports)) {
      expect(isSportType(key), `fr has orphan sport key "${key}"`).toBe(true)
    }
  })
})

describe('provider sport mappers return canonical SportTypes', () => {
  it('Garmin maps known types and falls back to "other"', () => {
    expect(mapGarminSport('TRAIL_RUNNING')).toBe('trail_running')
    expect(mapGarminSport('LAP_SWIMMING')).toBe('pool_swimming')
    expect(mapGarminSport('BOATING_V2')).toBe('boating') // _V2 variant
    expect(mapGarminSport('SOMETHING_UNKNOWN')).toBe('other')
    expect(isSportType(mapGarminSport('RUNNING'))).toBe(true)
  })

  it('Strava maps known types and falls back to "other"', () => {
    expect(mapStravaSport('TrailRun')).toBe('trail_running')
    expect(mapStravaSport('MountainBikeRide')).toBe('mountain_biking')
    expect(mapStravaSport('Nonsense')).toBe('other')
    expect(isSportType(mapStravaSport('Ride'))).toBe(true)
  })
})
