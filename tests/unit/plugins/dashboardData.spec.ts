import { describe, it, expect } from 'vitest'
import type { Activity } from '@/types/activity'
import {
  activeWeeks,
  mainSport,
  timeBySport,
  weekStart,
  weekSummary,
  weeklySeries,
  weeklySpeed
} from '@plugins/app-extensions/Statistics/dashboardData'

function act(id: string, iso: string, fields: Partial<Activity> = {}): Activity {
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

// Wednesday 4 November 2026, 18:00 — the week runs from Monday 2 November.
const NOW = new Date('2026-11-04T18:00:00')
const noAscent = () => undefined

describe('weekStart', () => {
  it('is the Monday at midnight, Sunday included in the week before it', () => {
    expect(weekStart(NOW)).toEqual(new Date('2026-11-02T00:00:00'))
    expect(weekStart(new Date('2026-11-08T23:00:00'))).toEqual(new Date('2026-11-02T00:00:00'))
  })
})

describe('mainSport', () => {
  it('is the sport with the most outings, whatever its case in storage', () => {
    const activities = [
      act('a', '2026-10-01T07:00:00', { type: 'RUNNING' }),
      act('b', '2026-10-02T07:00:00', { type: 'running' }),
      act('c', '2026-10-03T07:00:00', { type: 'cycling' }),
      act('d', '2026-10-04T07:00:00', { type: 'cycling', deleted: true }),
      act('e', '2026-10-05T07:00:00', { type: 'cycling', deleted: true })
    ]
    expect(mainSport(activities)).toBe('running')
  })

  it('is empty when there is nothing', () => {
    expect(mainSport([])).toBe('')
  })
})

describe('weekSummary', () => {
  it('compares the week with the week before up to the same moment', () => {
    const activities = [
      act('mon', '2026-11-02T07:00:00'),
      act('wed', '2026-11-04T07:00:00', { distance: 8000 }),
      // Last week: Tuesday counts, Thursday is after "now minus 7 days"
      act('lastTue', '2026-10-27T07:00:00', { distance: 6000 }),
      act('lastThu', '2026-10-29T07:00:00', { distance: 20000 })
    ]
    const { current, previousSoFar } = weekSummary(activities, noAscent, NOW)
    expect(current.distance).toBe(18000)
    expect(current.count).toBe(2)
    expect(previousSoFar.distance).toBe(6000)
  })

  it('puts each outing on its calendar day, Monday first, and marks today', () => {
    const activities = [act('wed', '2026-11-04T07:00:00'), act('wed2', '2026-11-04T17:00:00')]
    const { days } = weekSummary(activities, noAscent, NOW)
    expect(days.map(d => d.distance)).toEqual([0, 0, 20000, 0, 0, 0, 0])
    expect(days.findIndex(d => d.isToday)).toBe(2)
    expect(days[3].isFuture).toBe(true)
  })

  it('keeps a Sunday run on Sunday across the autumn clock change', () => {
    // 25 October 2026: clocks go back in Europe; the week has a 25 h day
    const sunday = new Date('2026-10-25T20:00:00')
    const { days } = weekSummary([act('s', '2026-10-25T19:00:00')], noAscent, sunday)
    expect(days[6].distance).toBe(10000)
  })

  it('adds the ascent the metrics index knows', () => {
    const activities = [act('a', '2026-11-03T07:00:00'), act('b', '2026-11-04T07:00:00')]
    const { current } = weekSummary(activities, id => (id === 'a' ? 150 : undefined), NOW)
    expect(current.ascent).toBe(150)
  })
})

describe('weeklySeries', () => {
  it('returns the last N weeks oldest first, the current one flagged', () => {
    const weeks = weeklySeries([], 12, NOW)
    expect(weeks).toHaveLength(12)
    expect(weeks[11].start).toEqual(new Date('2026-11-02T00:00:00'))
    expect(weeks[11].isCurrent).toBe(true)
    expect(weeks[0].start).toEqual(new Date('2026-08-17T00:00:00'))
  })

  it('splits each week by sport and leaves out older activities', () => {
    const activities = [
      act('r', '2026-10-27T07:00:00'),
      act('b', '2026-10-31T07:00:00', { type: 'cycling', distance: 50000, duration: 7200 }),
      act('old', '2025-01-01T07:00:00')
    ]
    const weeks = weeklySeries(activities, 4, NOW)
    const lastWeek = weeks[2]
    expect(lastWeek.bySport).toEqual({
      running: { distance: 10000, duration: 3000 },
      cycling: { distance: 50000, duration: 7200 }
    })
    expect(weeks.reduce((s, w) => s + w.distance, 0)).toBe(60000)
  })
})

describe('weeklySpeed', () => {
  it('divides total distance by total time, null for an empty week', () => {
    const activities = [
      act('fast', '2026-10-27T07:00:00', { distance: 5000, duration: 1500 }),
      act('long', '2026-10-28T07:00:00', { distance: 30000, duration: 10800 })
    ]
    const speeds = weeklySpeed(weeklySeries(activities, 2, NOW))
    expect(speeds[0]).toBeCloseTo(35000 / 12300, 6)
    expect(speeds[1]).toBeNull()
  })
})

describe('timeBySport', () => {
  it('sums the time per sport, largest first', () => {
    const activities = [
      act('r', '2026-10-27T07:00:00', { duration: 3600 }),
      act('b', '2026-10-31T07:00:00', { type: 'cycling', duration: 7200 })
    ]
    expect(timeBySport(weeklySeries(activities, 4, NOW))).toEqual([
      { sport: 'cycling', duration: 7200 },
      { sport: 'running', duration: 3600 }
    ])
  })
})

describe('activeWeeks', () => {
  it('counts the weeks holding at least one outing', () => {
    const activities = [
      act('a', '2026-11-03T07:00:00'),
      act('b', '2026-10-20T07:00:00'),
      act('c', '2026-10-21T07:00:00')
    ]
    expect(activeWeeks(activities, 4, NOW)).toBe(2)
  })
})
