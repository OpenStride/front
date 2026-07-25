/** Time bucket a series is grouped by. `activity` yields one point per outing. */
export type Granularity = 'activity' | 'week' | 'month' | 'year'

export const GRANULARITIES: Granularity[] = ['activity', 'week', 'month', 'year']

/** How the per-activity values of a bucket collapse into a single point */
export type PeriodOp = 'sum' | 'avg' | 'min' | 'max' | 'ratio'

export interface MetricDefinition {
  id: string
  /**
   * Path of the raw value, in one of three shapes:
   * - 'distance'            a top-level Activity field
   * - 'stats.maxHeartRate'  a stat of its details
   * - 'derived.time_5000'   a value of the per-activity metric index
   */
  sourceRef: string
  /**
   * Only for `ratio`: the bucket value is sum(sourceRef) / sum(denominatorRef),
   * which weights each activity by its own size instead of averaging averages.
   */
  denominatorRef?: string
  periodOp: PeriodOp
  /** Lower is better (pace, times) — the chart reverses its y axis */
  betterIsLower?: boolean
  /**
   * Set on the per-distance time metrics. Their label is built from a single
   * i18n pattern instead of one key per distance.
   */
  distanceLabel?: string
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

/** Per-activity derived values, read from the `activity_metrics` index */
export type DerivedMap = Map<string, Record<string, number>>

/** Everything a series may need beyond the activities themselves */
export interface MetricSources {
  stats: StatsMap
  derived: DerivedMap
}

export const EMPTY_SOURCES: MetricSources = { stats: new Map(), derived: new Map() }

/** One row of the `activity_metrics` store */
export interface ActivityMetricsRow {
  /** The activity id — this store is keyed on it */
  id: string
  startTime: number
  sport: string
  /** Index format; a row built by an older version is recomputed */
  indexVersion: number
  values: Record<string, number>
}

/** Convert startTime to milliseconds (handles both seconds and ms formats) */
export function toMs(timestamp: number): number {
  return timestamp < 1e11 ? timestamp * 1000 : timestamp
}

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
