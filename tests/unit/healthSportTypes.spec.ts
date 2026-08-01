import { describe, it, expect } from 'vitest'
import { isSportType } from '@/types/sport'
import { mapHealthSport } from '../../plugins/data-providers/HealthProvider/client/sportTypes'

describe('Health workout → SportType', () => {
  it('maps Apple HealthKit (snake_case) types', () => {
    expect(mapHealthSport('running')).toBe('running')
    expect(mapHealthSport('functional_strength_training')).toBe('strength_training')
    expect(mapHealthSport('downhill_skiing')).toBe('alpine_skiing')
  })

  it('maps Health Connect (UPPERCASE) types', () => {
    expect(mapHealthSport('TRAIL_RUN')).toBe('trail_running')
    expect(mapHealthSport('MOUNTAIN_BIKE')).toBe('mountain_biking')
    expect(mapHealthSport('SWIMMING_OPEN_WATER')).toBe('open_water_swimming')
  })

  it('strips the HKWorkoutActivityType prefix and falls back to "other"', () => {
    expect(mapHealthSport('HKWorkoutActivityTypeCycling')).toBe('cycling')
    expect(mapHealthSport('Nonsense')).toBe('other')
    expect(isSportType(mapHealthSport('running'))).toBe(true)
  })
})
