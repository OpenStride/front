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
