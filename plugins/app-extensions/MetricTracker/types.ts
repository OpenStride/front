/** Time bucket a series is grouped by. `activity` yields one point per outing. */
export type Granularity = 'activity' | 'week' | 'month' | 'year'

export const GRANULARITIES: Granularity[] = ['activity', 'week', 'month', 'year']

/** How the per-activity values of a bucket collapse into a single point */
export type PeriodOp = 'sum' | 'avg' | 'min' | 'max' | 'ratio'

export interface MetricDefinition {
  id: string
  /**
   * Path of the raw value. Either a top-level Activity field ('distance') or a
   * stat of its details ('stats.maxHeartRate').
   */
  sourceRef: string
  /**
   * Only for `ratio`: the bucket value is sum(sourceRef) / sum(denominatorRef),
   * which weights each activity by its own size instead of averaging averages.
   */
  denominatorRef?: string
  periodOp: PeriodOp
  /** Lower is better (pace) — the chart reverses its y axis */
  betterIsLower?: boolean
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

/** Convert startTime to milliseconds (handles both seconds and ms formats) */
export function toMs(timestamp: number): number {
  return timestamp < 1e11 ? timestamp * 1000 : timestamp
}

/** A metric reading `stats.*` needs ActivityDetails, which is loaded separately */
export function needsDetails(metric: MetricDefinition): boolean {
  return (
    metric.sourceRef.startsWith('stats.') || (metric.denominatorRef?.startsWith('stats.') ?? false)
  )
}
