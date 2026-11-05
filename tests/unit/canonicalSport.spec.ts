import { describe, it, expect } from 'vitest'
import { canonicalSport, getSportProfile } from '@/types/sport'
import { formatSportType } from '@/utils/sportLabels'

describe('canonicalSport', () => {
  it('maps the names old imports kept onto the canonical vocabulary', () => {
    // The Strava CSV import lower-cased whatever the file said
    expect(canonicalSport('run')).toBe('running')
    expect(canonicalSport('Run')).toBe('running')
    expect(canonicalSport('Ride')).toBe('cycling')
    expect(canonicalSport('Virtual Ride')).toBe('indoor_cycling')
    expect(canonicalSport('Trail Run')).toBe('trail_running')
  })

  it('normalises case and spacing of names already canonical', () => {
    expect(canonicalSport('RUNNING')).toBe('running')
    expect(canonicalSport('Trail Running')).toBe('trail_running')
    expect(canonicalSport('  cycling ')).toBe('cycling')
  })

  it('keeps an unknown sport under its own name rather than merging it', () => {
    expect(canonicalSport('Underwater Hockey')).toBe('underwater_hockey')
    expect(canonicalSport(undefined)).toBe('')
  })

  it('gives a legacy `run` the running profile and label, pace included', () => {
    expect(getSportProfile('run').primaryMetric).toBe('pace')
    expect(formatSportType('run')).toBe(formatSportType('running'))
  })
})

describe('sport scopes — trail is running with a climb', () => {
  it('counts road, treadmill and trail under running, and splits them on demand', async () => {
    const { matchesSportScope, ROAD_RUNNING } = await import('@/types/sport')
    expect(matchesSportScope('running', 'trail_running')).toBe(true)
    expect(matchesSportScope('running', 'TREADMILL_RUNNING')).toBe(true)
    expect(matchesSportScope('running', 'run')).toBe(true)
    expect(matchesSportScope(ROAD_RUNNING, 'running')).toBe(true)
    expect(matchesSportScope(ROAD_RUNNING, 'treadmill_running')).toBe(true)
    expect(matchesSportScope(ROAD_RUNNING, 'trail_running')).toBe(false)
    expect(matchesSportScope('trail_running', 'running')).toBe(false)
    expect(matchesSportScope('running', 'cycling')).toBe(false)
    expect(matchesSportScope('', 'cycling')).toBe(true)
  })

  it('offers the split only when there is something to split', async () => {
    const { sportScopes } = await import('@/types/sport')
    expect(sportScopes(['running', 'treadmill_running', 'cycling'])).toEqual(['running', 'cycling'])
    expect(sportScopes(['RUNNING', 'trail_running', 'swim'])).toEqual([
      'running',
      'road_running',
      'trail_running',
      'swimming'
    ])
    expect(sportScopes(['trail_running'])).toEqual(['trail_running'])
  })

  it('reads a road run like a run', async () => {
    const { getSportProfile } = await import('@/types/sport')
    expect(getSportProfile('road_running').primaryMetric).toBe('pace')
  })
})
