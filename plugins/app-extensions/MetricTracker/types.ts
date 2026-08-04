import { openRange, rollingRange, type TimeRange } from '@/utils/timeRange'
import type { DerivedMap } from '@/composables/useActivityMetricsIndex'
import type { ActivitySource } from '@/types/activitySources'

export type { DerivedMap }

/** Time bucket a series is grouped by. `activity` yields one point per outing. */
export type Granularity = 'activity' | 'week' | 'month' | 'year'

export const GRANULARITIES: Granularity[] = ['activity', 'week', 'month', 'year']

/** Rolling windows offered by the view, plus the unbounded one */
export type WindowId = 'all' | '3m' | '6m' | '12m'

export const WINDOWS: WindowId[] = ['all', '12m', '6m', '3m']

const WINDOW_MONTHS: Record<Exclude<WindowId, 'all'>, number> = {
  '3m': 3,
  '6m': 6,
  '12m': 12
}

export function windowRange(id: WindowId, now: Date = new Date()): TimeRange {
  return id === 'all' ? openRange() : rollingRange({ months: WINDOW_MONTHS[id] }, now)
}

/** Buckets a granularity carves out of one month */
const BUCKETS_PER_MONTH: Record<Exclude<Granularity, 'activity'>, number> = {
  week: 30.44 / 7,
  month: 1,
  year: 1 / 12
}

/**
 * Below three points a trend means nothing: two points only ever describe the
 * line through themselves.
 */
const MIN_BUCKETS = 3

/**
 * How many points a window would yield at this granularity.
 *
 * Infinite for anything unbounded — an open window, or a per-outing series
 * whose point count depends on the data rather than on the calendar.
 */
export function bucketEstimate(window: WindowId, granularity: Granularity): number {
  if (window === 'all' || granularity === 'activity') return Infinity
  return WINDOW_MONTHS[window] * BUCKETS_PER_MONTH[granularity]
}

/**
 * Windows worth offering at this granularity.
 *
 * Yearly buckets over three months collapse to a single point, which reads as
 * a broken chart rather than as an empty one. Offering only what can produce a
 * readable series beats letting the pair be picked and then explaining it.
 */
export function availableWindows(granularity: Granularity): WindowId[] {
  return WINDOWS.filter(w => bucketEstimate(w, granularity) >= MIN_BUCKETS)
}

/** How the per-activity values of a bucket collapse into a single point */
export type PeriodOp = 'sum' | 'avg' | 'min' | 'max' | 'ratio'

/**
 * Where a metric's raw value comes from.
 *
 * Either a name from the shared registry — which the compiler ties to the real
 * `Activity` / `ActivityDetails` fields — or a value of the per-activity index,
 * whose keys are generated (`derived.time_5000`) and so stay a template.
 */
export type MetricSourceRef = ActivitySource | `derived.${string}`

export interface MetricDefinition {
  id: string
  sourceRef: MetricSourceRef
  /**
   * Only for `ratio`: the bucket value is sum(sourceRef) / sum(denominatorRef),
   * which weights each activity by its own size instead of averaging averages.
   */
  denominatorRef?: MetricSourceRef
  periodOp: PeriodOp
  /** Lower is better (pace, times) — the chart reverses its y axis */
  betterIsLower?: boolean
  /**
   * Set on the per-distance time metrics. Their label is built from a single
   * i18n pattern instead of one key per distance.
   */
  distanceLabel?: string
  /**
   * A name to show as-is, for a metric the app did not name.
   *
   * The built-in metrics resolve their label from a locale key, which is right
   * for a vocabulary we ship and translate. A custom aggregate is named by the
   * person who defined it, five seconds ago, in whatever language they think
   * in — reading it through `t()` would render their own words as a missing
   * key.
   */
  label?: string
  /** Stored unit -> plotted unit, e.g. metres -> km */
  toDisplay: (raw: number) => number
  /** Plotted value -> human label, used for axis ticks and tooltips */
  format: (display: number) => string
}

export interface SeriesPoint {
  /** Activity id, or the period key ("2026-W30", "2026-07", "2026") */
  key: string
  /** Earliest activity of the bucket, in ms — the series is sorted on it */
  startTime: number
  /** In display unit; null when no activity of the bucket carried the metric */
  value: number | null
  /** Activities that actually contributed a value */
  count: number
}

/** Per-activity stats extracted from ActivityDetails, samples discarded */
export type StatsMap = Map<string, Record<string, number | undefined>>

/** Everything a series may need beyond the activities themselves */
export interface MetricSources {
  stats: StatsMap
  derived: DerivedMap
}

export { toMs } from '@/utils/timeRange'

function refsOf(metric: MetricDefinition): string[] {
  return metric.denominatorRef ? [metric.sourceRef, metric.denominatorRef] : [metric.sourceRef]
}

/** A metric reading `stats.*` needs ActivityDetails, which is loaded separately */
export function needsDetails(metric: MetricDefinition): boolean {
  return refsOf(metric).some(ref => ref.startsWith('stats.'))
}

/** A metric reading `derived.*` needs the per-activity index to be built */
export function needsIndex(metric: MetricDefinition): boolean {
  return refsOf(metric).some(ref => ref.startsWith('derived.'))
}
