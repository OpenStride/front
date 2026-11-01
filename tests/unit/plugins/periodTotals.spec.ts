import { describe, it, expect } from 'vitest'
import type { Activity } from '@/types/activity'
import { periodTotals } from '@plugins/app-extensions/Statistics/periodTotals'

function run(id: string, iso: string, fields: Partial<Activity> = {}): Activity {
  return {
    id,
    provider: 'test',
    type: 'running',
    startTime: new Date(iso).getTime(),
    distance: 10000,
    duration: 3000,
    version: 1,
    lastModified: 1,
    ...fields
  } as Activity
}

// Sunday 1 November 2026: the ISO week runs from Monday 26 October.
const NOW = new Date('2026-11-01T18:00:00')
const noAscent = () => undefined

describe('periodTotals', () => {
  it('sums the activities of the current week, and of the week before for the delta', () => {
    const activities = [
      run('mon', '2026-10-26T07:00:00'),
      run('sun', '2026-11-01T09:00:00', { distance: 8000, duration: 2400 }),
      run('prev', '2026-10-21T07:00:00', { distance: 5000 }),
      run('old', '2026-09-01T07:00:00', { distance: 42000 })
    ]

    const { current, previous } = periodTotals(activities, 'week', noAscent, NOW)

    expect(current).toEqual({ distance: 18000, duration: 5400, ascent: 0, count: 2 })
    expect(previous.distance).toBe(5000)
  })

  it('counts an activity once, however many times it was saved', () => {
    // The aggregation store added every re-save; a list of activities cannot.
    const once = run('a', '2026-10-28T07:00:00')
    expect(periodTotals([once], 'week', noAscent, NOW).current.distance).toBe(10000)
  })

  it('leaves out deleted activities and activities without a usable date', () => {
    const activities = [
      run('gone', '2026-10-28T07:00:00', { deleted: true }),
      run('undated', '2026-10-28T07:00:00', { startTime: 0 }),
      run('kept', '2026-10-28T07:00:00')
    ]
    expect(periodTotals(activities, 'week', noAscent, NOW).current.count).toBe(1)
  })

  it('accepts a start time in seconds, as Garmin stores it', () => {
    const garmin = run('g', '2026-10-28T07:00:00')
    garmin.startTime = Math.floor(garmin.startTime / 1000)
    expect(periodTotals([garmin], 'week', noAscent, NOW).current.distance).toBe(10000)
  })

  it('adds the ascent the metrics index knows, and nothing for the rest', () => {
    const activities = [run('a', '2026-10-28T07:00:00'), run('b', '2026-10-29T07:00:00')]
    const ascent = (id: string) => (id === 'a' ? 120 : undefined)
    expect(periodTotals(activities, 'week', ascent, NOW).current.ascent).toBe(120)
  })

  it('compares a month with the month before, even from the 31st', () => {
    const activities = [
      run('oct', '2026-10-05T07:00:00', { distance: 3000 }),
      run('sep', '2026-09-30T07:00:00', { distance: 7000 })
    ]
    const { current, previous } = periodTotals(
      activities,
      'month',
      noAscent,
      new Date('2026-10-31T12:00:00')
    )
    expect(current.distance).toBe(3000)
    // setMonth(-1) from 31 October would land on 1 October, not in September.
    expect(previous.distance).toBe(7000)
  })
})
