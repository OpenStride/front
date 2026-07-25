/**
 * Time windows: which activities are in scope.
 *
 * Deliberately separate from `dateKeys.ts`, which answers the orthogonal
 * question of how in-scope activities are grouped. "The last 12 months, by
 * week" is a legitimate combination of the two.
 */

export type CalendarPeriod = 'month' | 'quarter' | 'year'

export interface TimeRange {
  /** Inclusive lower bound in ms, null when open */
  start: number | null
  /** Exclusive upper bound in ms, null when open */
  end: number | null
  /**
   * Stable identity of the window, or null when it moves with the clock.
   *
   * A calendar window ("2026-Q3") can key a cache: the entry expires by itself
   * when the quarter rolls over. A rolling window shifts every day and has no
   * such identity — caching on it would never expire correctly.
   */
  key: string | null
}

/** A window whose identity is stable, so it is safe to key a cache on */
export interface KeyedTimeRange extends TimeRange {
  key: string
}

/** A calendar window: keyed, and closed on both sides */
export interface BoundedTimeRange extends KeyedTimeRange {
  start: number
  end: number
}

/** Convert a timestamp to milliseconds (handles both seconds and ms formats) */
export function toMs(timestamp: number): number {
  return timestamp < 1e11 ? timestamp * 1000 : timestamp
}

/** Everything, with no bound */
export function openRange(): KeyedTimeRange {
  return { start: null, end: null, key: 'all' }
}

/** The current calendar month, quarter or year, in local time */
export function calendarRange(period: CalendarPeriod, now: Date = new Date()): BoundedTimeRange {
  const year = now.getFullYear()

  if (period === 'month') {
    const month = now.getMonth()
    return {
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      start: new Date(year, month, 1).getTime(),
      end: new Date(year, month + 1, 1).getTime()
    }
  }

  if (period === 'quarter') {
    const quarter = Math.floor(now.getMonth() / 3)
    return {
      key: `${year}-Q${quarter + 1}`,
      start: new Date(year, quarter * 3, 1).getTime(),
      end: new Date(year, quarter * 3 + 3, 1).getTime()
    }
  }

  return {
    key: `${year}`,
    start: new Date(year, 0, 1).getTime(),
    end: new Date(year + 1, 0, 1).getTime()
  }
}

/**
 * A window reaching back from now, e.g. the last 12 months.
 *
 * Left open on the future side, so an activity stamped a few minutes ahead by
 * a skewed device clock still counts. Month arithmetic overflows the way the
 * Date constructor does: one month back from 31 March lands in early March.
 */
export function rollingRange(
  span: { days?: number; months?: number },
  now: Date = new Date()
): TimeRange & { key: null } {
  const start = new Date(now.getTime())
  if (span.months) start.setMonth(start.getMonth() - span.months)
  if (span.days) start.setDate(start.getDate() - span.days)

  return { start: start.getTime(), end: null, key: null }
}

/**
 * Whether a timestamp falls inside the window.
 *
 * Takes the raw stored value: activity timestamps come in seconds or in
 * milliseconds depending on the provider, and normalising here keeps every
 * caller from having to remember it.
 */
export function inRange(timestamp: number, range: TimeRange): boolean {
  const time = toMs(timestamp)
  if (range.start !== null && time < range.start) return false
  if (range.end !== null && time >= range.end) return false
  return true
}
