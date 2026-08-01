import { describe, it, expect } from 'vitest'
import { toMs, openRange, calendarRange, rollingRange, inRange } from '@/utils/timeRange'
import {
  periodKey,
  getDayKey,
  getISOWeekKey,
  getMonthKey,
  getQuarterKey,
  getYearKey,
  PERIOD_GRANULARITIES
} from '@/utils/dateKeys'

// 2026-07-25, a Saturday in Q3
const NOW = new Date(2026, 6, 25, 14, 30)

describe('toMs', () => {
  it('passes milliseconds through and scales seconds up', () => {
    const ms = new Date(2026, 6, 25).getTime()
    expect(toMs(ms)).toBe(ms)
    expect(toMs(Math.floor(ms / 1000))).toBe(Math.floor(ms / 1000) * 1000)
  })
})

describe('calendarRange', () => {
  it('bounds the current month, quarter and year', () => {
    expect(calendarRange('month', NOW)).toEqual({
      key: '2026-07',
      start: new Date(2026, 6, 1).getTime(),
      end: new Date(2026, 7, 1).getTime()
    })
    expect(calendarRange('quarter', NOW).key).toBe('2026-Q3')
    expect(calendarRange('year', NOW)).toEqual({
      key: '2026',
      start: new Date(2026, 0, 1).getTime(),
      end: new Date(2027, 0, 1).getTime()
    })
  })

  it('rolls over at period boundaries', () => {
    expect(calendarRange('quarter', new Date(2026, 2, 31)).key).toBe('2026-Q1')
    expect(calendarRange('quarter', new Date(2026, 3, 1)).key).toBe('2026-Q2')
    expect(calendarRange('month', new Date(2026, 11, 15)).end).toBe(new Date(2027, 0, 1).getTime())
  })

  it('nests a month inside its quarter, and the quarter inside its year', () => {
    const month = calendarRange('month', NOW)
    const quarter = calendarRange('quarter', NOW)
    const year = calendarRange('year', NOW)

    expect(month.start >= quarter.start).toBe(true)
    expect(month.end <= quarter.end).toBe(true)
    expect(quarter.start >= year.start).toBe(true)
    expect(quarter.end <= year.end).toBe(true)
  })

  it('always carries a key, so it can back a cache', () => {
    for (const period of ['month', 'quarter', 'year'] as const) {
      expect(calendarRange(period, NOW).key).toBeTruthy()
    }
    expect(openRange().key).toBe('all')
  })
})

describe('rollingRange', () => {
  it('reaches back the requested number of months', () => {
    const range = rollingRange({ months: 12 }, NOW)
    expect(range.start).toBe(new Date(2025, 6, 25, 14, 30).getTime())
  })

  it('stays open on the future side', () => {
    // A device clock running slightly ahead must not drop its own activity
    const range = rollingRange({ months: 3 }, NOW)
    expect(range.end).toBeNull()
    expect(inRange(NOW.getTime() + 60_000, range)).toBe(true)
  })

  it('has no key, because it moves with the clock', () => {
    expect(rollingRange({ months: 12 }, NOW).key).toBeNull()
    expect(rollingRange({ days: 30 }, NOW).key).toBeNull()
  })

  it('supports a span in days', () => {
    const range = rollingRange({ days: 30 }, NOW)
    expect(range.start).toBe(new Date(2026, 5, 25, 14, 30).getTime())
  })
})

describe('inRange', () => {
  const range = calendarRange('month', NOW)

  it('includes the lower bound and excludes the upper one', () => {
    expect(inRange(range.start, range)).toBe(true)
    expect(inRange(range.end, range)).toBe(false)
    expect(inRange(range.end - 1, range)).toBe(true)
  })

  it('accepts everything in an open range', () => {
    expect(inRange(0, openRange())).toBe(true)
    expect(inRange(NOW.getTime(), openRange())).toBe(true)
  })

  it('normalises second-based timestamps before comparing', () => {
    const midMonth = new Date(2026, 6, 15).getTime()
    expect(inRange(Math.floor(midMonth / 1000), range)).toBe(true)
  })
})

describe('periodKey', () => {
  it('delegates to the matching key helper', () => {
    expect(periodKey(NOW, 'day')).toBe(getDayKey(NOW))
    expect(periodKey(NOW, 'week')).toBe(getISOWeekKey(NOW))
    expect(periodKey(NOW, 'month')).toBe(getMonthKey(NOW))
    expect(periodKey(NOW, 'quarter')).toBe(getQuarterKey(NOW))
    expect(periodKey(NOW, 'year')).toBe(getYearKey(NOW))
  })

  it('produces a distinct key per granularity', () => {
    const keys = PERIOD_GRANULARITIES.map(g => periodKey(NOW, g))
    expect(new Set(keys).size).toBe(PERIOD_GRANULARITIES.length)
  })

  it('keeps the formats the stored caches and aggregates rely on', () => {
    expect(periodKey(NOW, 'day')).toBe('2026-07-25')
    expect(periodKey(NOW, 'month')).toBe('2026-07')
    expect(periodKey(NOW, 'quarter')).toBe('2026-Q3')
    expect(periodKey(NOW, 'year')).toBe('2026')
    expect(periodKey(NOW, 'week')).toMatch(/^\d{4}-W\d{2}$/)
  })
})
