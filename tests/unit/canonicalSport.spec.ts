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
