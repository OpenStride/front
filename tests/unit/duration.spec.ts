import { describe, it, expect } from 'vitest'
import { formatClock, formatCompactDuration, formatRecordTime } from '@/utils/duration'

describe('formatClock', () => {
  it('drops the hour until there is one', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(52)).toBe('0:52')
    expect(formatClock(2332)).toBe('38:52')
  })

  it('adds the hour once the duration reaches it', () => {
    expect(formatClock(3600)).toBe('1:00:00')
    expect(formatClock(6734)).toBe('1:52:14')
  })

  /**
   * The reason the copies had to go: the one built on
   * `new Date(sec * 1000).toISOString()` read the time of day out of an epoch,
   * so a 25-hour recording came back as "01:00:00".
   */
  it('keeps counting past twenty-four hours', () => {
    expect(formatClock(25 * 3600)).toBe('25:00:00')
    expect(formatClock(100 * 3600 + 61)).toBe('100:01:01')
  })

  it('pads the leading unit on request, for a column that aligns', () => {
    expect(formatClock(330, { padLeading: true })).toBe('05:30')
    expect(formatClock(6734, { padLeading: true })).toBe('01:52:14')
  })

  it('says there is no value rather than printing zero', () => {
    expect(formatClock(undefined)).toBe('—')
    expect(formatClock(NaN)).toBe('—')
    expect(formatClock(Infinity)).toBe('—')
  })

  it('rounds to the second and never goes negative', () => {
    expect(formatClock(59.6)).toBe('1:00')
    expect(formatClock(-10)).toBe('0:00')
  })
})

describe('formatCompactDuration', () => {
  it('reads in hours and minutes past the hour', () => {
    expect(formatCompactDuration(11100)).toBe('3h05')
    expect(formatCompactDuration(3600)).toBe('1h00')
  })

  it('reads in minutes below the hour', () => {
    expect(formatCompactDuration(2700)).toBe('45 min')
    expect(formatCompactDuration(0)).toBe('0 min')
  })

  it('says there is no value rather than printing zero', () => {
    expect(formatCompactDuration(undefined)).toBe('—')
    expect(formatCompactDuration(NaN)).toBe('—')
  })
})

describe('formatRecordTime', () => {
  it('reads a best time the way it is said aloud', () => {
    expect(formatRecordTime(330)).toBe('5\'30"')
    expect(formatRecordTime(3765)).toBe('1h02\'45"')
  })

  it('says there is no value rather than printing zero', () => {
    expect(formatRecordTime(undefined)).toBe('—')
  })
})
