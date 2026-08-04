import { aggregateSumKey, aggregateWeightKey, type CustomAggregate } from '@/types/customAggregate'
import { SAMPLE_FIELD_SPECS } from '@/types/sampleFields'
import { convertQuantity } from '@/composables/useUnits'
import type { MetricDefinition, PeriodOp } from './types'

/**
 * How a per-activity pair collapses into one point.
 *
 * `avg` becomes a `ratio` rather than an `avg`: the index stores a sum and the
 * weight behind it, and a month is the sum of the sums over the sum of the
 * weights. Averaging the per-activity averages would weigh a twenty-minute
 * outing like a three-hour one — the very thing the pair was stored to avoid.
 *
 * `min` and `max` need no denominator: the sum slot already holds the extremum.
 */
function periodOpOf(aggregate: CustomAggregate): PeriodOp {
  return aggregate.measure.op === 'avg' ? 'ratio' : aggregate.measure.op
}

/**
 * Turn a saved aggregate into something the tracker can plot.
 *
 * The tracker reads `derived.*` refs against the per-activity index, which is
 * exactly where `evaluateAggregates` writes. Nothing in the series builder had
 * to learn about custom aggregates — they arrive as two more derived keys.
 */
export function toMetricDefinition(aggregate: CustomAggregate): MetricDefinition {
  const spec = SAMPLE_FIELD_SPECS[aggregate.measure.field]
  const periodOp = periodOpOf(aggregate)

  const definition: MetricDefinition = {
    id: aggregate.id,
    label: aggregate.label,
    sourceRef: `derived.${aggregateSumKey(aggregate.id)}`,
    periodOp,
    betterIsLower: aggregate.betterIsLower,
    toDisplay: raw =>
      spec.dimension ? convertQuantity(spec.dimension, raw).value : raw * (spec.scale ?? 1),
    format: value => {
      const unit = spec.dimension ? convertQuantity(spec.dimension, 0).unit : (spec.unit ?? '')
      const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10
      return unit ? `${rounded} ${unit}` : String(rounded)
    }
  }

  if (periodOp === 'ratio') {
    definition.denominatorRef = `derived.${aggregateWeightKey(aggregate.id)}`
  }

  return definition
}

export function toMetricDefinitions(aggregates: CustomAggregate[]): MetricDefinition[] {
  return aggregates.filter(a => a.enabled).map(toMetricDefinition)
}
