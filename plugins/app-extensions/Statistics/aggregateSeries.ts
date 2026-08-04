import type { AggregatedRecord, AggregationPeriod } from '@/types/aggregation'

/** Time windows a card can be narrowed to. */
export type WindowId = 'all' | '12m' | '6m' | '3m'

/**
 * How many buckets a window holds, per period.
 *
 * Expressed in buckets rather than in dates because that is what the records
 * are: `buildAggregateRecords` already did the bucketing, so a window here is a
 * count of the tail, not a second date computation that could disagree with the
 * first about where a week starts.
 *
 * A year period has no window: three months of yearly buckets is one point, and
 * a chart of one point is a chart nobody can read.
 */
const WINDOW_BUCKETS: Record<AggregationPeriod, Partial<Record<WindowId, number>>> = {
  week: { '3m': 13, '6m': 26, '12m': 52 },
  month: { '3m': 3, '6m': 6, '12m': 12 },
  year: {}
}

/** Windows worth offering — the ones that would leave more than one point. */
export function availableWindows(period: AggregationPeriod): WindowId[] {
  const offered = Object.keys(WINDOW_BUCKETS[period]) as WindowId[]
  return offered.length ? [...offered.sort(), 'all'] : []
}

export interface SeriesPoint {
  key: string
  value: number
}

/**
 * The points to plot, oldest first.
 *
 * Sorted on the period key, which is safe because every key of a given period
 * has the same shape and the same width — `2026-W05` before `2026-W30`,
 * `2026-07` before `2026-11`. A window keeps the tail, so a chart always ends
 * on the period being read rather than on whichever one happened to be last in
 * the store.
 */
export function buildSeries(
  records: AggregatedRecord[],
  period: AggregationPeriod,
  window: WindowId
): SeriesPoint[] {
  const points = records
    .filter(r => r.periodType === period && Number.isFinite(r.value))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
    .map(r => ({ key: r.periodKey, value: r.value }))

  const size = WINDOW_BUCKETS[period][window]
  return size === undefined ? points : points.slice(-size)
}
