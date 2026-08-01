/**
 * Shared date-key helpers used by AggregationService and plugins (e.g. Statistics).
 * Extracted so plugins can import utilities without pulling in service internals.
 *
 * A key identifies the bucket a date falls into. It answers "how do I group?",
 * not "what is in scope?" — that second question belongs to `timeRange.ts`.
 */

/** Granularity a series can be grouped by */
export type PeriodGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

export const PERIOD_GRANULARITIES: PeriodGranularity[] = ['day', 'week', 'month', 'quarter', 'year']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(weekNo)}`
}

export function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The inverse of `getDayKey`: a `YYYY-MM-DD` back to a local instant.
 *
 * Local rather than UTC, because a day filter is read as the user's day —
 * `new Date('2026-03-01')` is midnight UTC, which lands on the last evening of
 * February for anyone west of Greenwich and would silently drop a run.
 * `bound: 'end'` returns the last millisecond, so a range reads as inclusive.
 */
export function fromDayKey(key: string, bound: 'start' | 'end' = 'start'): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return undefined

  const [, year, month, day] = match
  const date =
    bound === 'start'
      ? new Date(+year, +month - 1, +day, 0, 0, 0, 0)
      : new Date(+year, +month - 1, +day, 23, 59, 59, 999)

  return Number.isNaN(date.getTime()) ? undefined : date.getTime()
}

export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function getQuarterKey(date: Date): string {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`
}

export function getYearKey(date: Date): string {
  return `${date.getFullYear()}`
}

/** The bucket a date belongs to, at the requested granularity */
export function periodKey(date: Date, granularity: PeriodGranularity): string {
  switch (granularity) {
    case 'day':
      return getDayKey(date)
    case 'week':
      return getISOWeekKey(date)
    case 'month':
      return getMonthKey(date)
    case 'quarter':
      return getQuarterKey(date)
    case 'year':
      return getYearKey(date)
  }
}
