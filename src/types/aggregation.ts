import type { ActivitySource } from './activitySources'
import type { Dimension } from './units'

export type AggregationPeriod = 'week' | 'month' | 'year'
export type AggregationOp = 'sum' | 'avg' // sprint 1 scope

export interface AggregationMetricDefinition {
  id: string
  label: string
  enabled: boolean
  /** Which numeric field to aggregate — see `ACTIVITY_SOURCES`. */
  sourceRef: ActivitySource
  aggregation: AggregationOp
  periods: AggregationPeriod[]
  unit?: string
  decimals?: number
  /**
   * Which dimension to render the aggregate in, when it has one.
   *
   * Not a unit and not a factor: those were a second, preference-blind copy of
   * the conversion table, so an aggregate read "km" to everyone. The renderer
   * passes this to `units.format`, which is the only place a factor lives.
   */
  dimension?: Dimension
}

export interface AggregatedRecord {
  id: string // metricId|periodType|periodKey
  metricId: string
  periodType: AggregationPeriod
  periodKey: string // e.g. 2025-W42 / 2025-10 / 2025
  value: number
  sum: number
  /** Activities behind the figure. Always a count, never a denominator. */
  count: number
  /**
   * Denominator of a weighted aggregate — seconds or metres, not a tally.
   *
   * Absent on the built-in metrics, which average per activity and divide by
   * `count`. A custom aggregate weights each sample by the time or distance it
   * stands for, so its denominator is a measurement and needed its own field:
   * reusing `count` for it would have made a field named "count" hold 4271.3.
   */
  weight?: number
  lastUpdated: number
}
