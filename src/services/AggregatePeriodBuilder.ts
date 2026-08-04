import type { ActivityMetricsRow } from '@/composables/useActivityMetricsIndex'
import type { AggregatedRecord, AggregationPeriod } from '@/types/aggregation'
import type { CustomAggregate } from '@/types/customAggregate'
import { aggregateSumKey, aggregateWeightKey } from '@/types/customAggregate'
import { periodKey } from '@/utils/dateKeys'
import { appliesToSport } from './AggregateEvaluator'

/** The buckets a custom aggregate is rolled up into. */
export const AGGREGATE_PERIODS: AggregationPeriod[] = ['week', 'month', 'year']

interface Bucket {
  sum: number
  weight: number
  count: number
  extremum: number
}

/**
 * Fold the per-activity values of the index into period records.
 *
 * Recomputed wholesale rather than maintained incrementally, unlike the
 * built-in metrics. Those count activities as they arrive, which works because
 * an activity's contribution never changes once counted. A custom aggregate's
 * does: editing its band changes what every past outing contributed, and an
 * incremental counter has no way to subtract a figure it no longer knows. A
 * full fold is a pass over rows already in memory, so the simpler thing is also
 * the affordable one.
 *
 * The rollup reads `sum` and `weight` separately for exactly the reason they
 * are stored separately: a month is the sum of the sums over the sum of the
 * weights, never the mean of the per-activity means.
 */
export function buildAggregateRecords(
  rows: ActivityMetricsRow[],
  definitions: CustomAggregate[],
  now: number = Date.now()
): AggregatedRecord[] {
  const records: AggregatedRecord[] = []

  for (const definition of definitions) {
    const sumKey = aggregateSumKey(definition.id)
    const weightKey = aggregateWeightKey(definition.id)
    const buckets = new Map<AggregationPeriod, Map<string, Bucket>>()

    for (const row of rows) {
      if (!appliesToSport(definition, row.sport)) continue

      const sum = row.values[sumKey]
      const weight = row.values[weightKey]
      if (typeof sum !== 'number' || !Number.isFinite(sum)) continue
      if (typeof weight !== 'number' || !Number.isFinite(weight)) continue

      // A row without a usable date cannot be placed in any bucket. Dropping it
      // beats filing a whole library under whatever epoch zero happens to be.
      if (!Number.isFinite(row.startTime) || row.startTime <= 0) continue
      const date = new Date(row.startTime)

      for (const period of AGGREGATE_PERIODS) {
        const key = periodKey(date, period)
        let byKey = buckets.get(period)
        if (!byKey) buckets.set(period, (byKey = new Map()))

        const bucket = byKey.get(key)
        if (!bucket) {
          byKey.set(key, { sum, weight, count: 1, extremum: sum })
        } else {
          bucket.sum += sum
          bucket.weight += weight
          bucket.count += 1
          bucket.extremum =
            definition.periodOp === 'min'
              ? Math.min(bucket.extremum, sum)
              : Math.max(bucket.extremum, sum)
        }
      }
    }

    for (const [period, byKey] of buckets) {
      for (const [key, bucket] of byKey) {
        records.push({
          id: `${definition.id}|${period}|${key}`,
          metricId: definition.id,
          periodType: period,
          periodKey: key,
          value: foldValue(definition, bucket),
          sum: bucket.sum,
          count: bucket.count,
          weight: bucket.weight,
          lastUpdated: now
        })
      }
    }
  }

  return records
}

/**
 * A bucket with weight but no value cannot be averaged, and reporting zero
 * would state that the user rode at zero. Such a bucket is not emitted at all —
 * `buildAggregateRecords` only ever creates one from a row that carried both
 * numbers.
 */
function foldValue(definition: CustomAggregate, bucket: Bucket): number {
  switch (definition.periodOp) {
    case 'sum':
      return bucket.sum
    case 'min':
    case 'max':
      return bucket.extremum
    case 'avg':
    default:
      return bucket.weight > 0 ? bucket.sum / bucket.weight : 0
  }
}
