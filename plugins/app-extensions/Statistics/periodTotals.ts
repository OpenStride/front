import type { Activity } from '@/types/activity'
import type { AggregationPeriod } from '@/types/aggregation'
import { periodKey } from '@/utils/dateKeys'
import { toMs } from '@/utils/timeRange'

/** SI totals of one period. */
export interface PeriodTotals {
  /** Metres. */
  distance: number
  /** Seconds. */
  duration: number
  /** Metres climbed, over the outings whose ascent is known. */
  ascent: number
  count: number
}

const EMPTY: PeriodTotals = { distance: 0, duration: 0, ascent: 0, count: 0 }

/** A date sitting inside the period before the one `now` is in. */
export function previousPeriodDate(period: AggregationPeriod, now: Date): Date {
  const d = new Date(now)
  if (period === 'week') d.setDate(d.getDate() - 7)
  else if (period === 'month') d.setMonth(d.getMonth() - 1, 1)
  else d.setFullYear(d.getFullYear() - 1)
  return d
}

/**
 * The totals of the current period and of the one before, summed from the
 * activities the page already shows.
 *
 * Read from the same list as the calendar and the trends rather than from the
 * aggregation store, so the headline cannot disagree with the blocks under it,
 * and it follows the sport filter like they do. The store kept its own copy of
 * every figure, and each way that copy drifted — double counts, deleted
 * outings, a rebuild that had not finished — showed up here first.
 *
 * `ascentOf` reads the metrics index, which holds the climb of each outing; an
 * outing it has not indexed yet simply adds nothing until it has.
 */
export function periodTotals(
  activities: Activity[],
  period: AggregationPeriod,
  ascentOf: (id: string) => number | undefined,
  now: Date = new Date()
): { current: PeriodTotals; previous: PeriodTotals } {
  const currentKey = periodKey(now, period)
  const previousKey = periodKey(previousPeriodDate(period, now), period)
  const current = { ...EMPTY }
  const previous = { ...EMPTY }

  for (const activity of activities) {
    if (activity.deleted) continue
    const start = toMs(activity.startTime)
    if (!Number.isFinite(start) || start <= 0) continue
    const key = periodKey(new Date(start), period)
    const bucket = key === currentKey ? current : key === previousKey ? previous : null
    if (!bucket) continue

    bucket.distance += finite(activity.distance)
    bucket.duration += finite(activity.duration)
    bucket.ascent += finite(ascentOf(activity.id))
    bucket.count += 1
  }

  return { current, previous }
}

function finite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
