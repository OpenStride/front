import type { Sample } from '@/types/activity'
import type { CustomAggregate, SampleFilter } from '@/types/customAggregate'
import { aggregateSumKey, aggregateWeightKey } from '@/types/customAggregate'
import type { SampleField } from '@/types/sampleFields'
import { deriveSeries } from '@/utils/derivedSamples'

/**
 * What one activity contributes to one aggregate.
 *
 * Two numbers, never their ratio. A monthly point is the sum of the sums over
 * the sum of the weights; storing the ratio would make it the mean of twelve
 * per-activity means, weighting a twenty-minute outing like a three-hour one.
 * For `min` and `max` the sum slot holds the extremum instead, and the weight
 * only serves the significance floor.
 */
export interface AggregateAccumulator {
  sum: number
  weight: number
}

/** Lowercased on both sides: legacy activities carry raw provider strings. */
export function appliesToSport(definition: CustomAggregate, sport: string): boolean {
  if (!definition.sports?.length) return true
  const wanted = definition.sports.map(s => s.toLowerCase())
  return wanted.includes((sport || '').toLowerCase())
}

/**
 * `min` inclusive, `max` exclusive, so adjacent bands tile without overlapping
 * and without dropping the value on the seam.
 */
function matches(filter: SampleFilter, value: number | undefined): boolean {
  if (value === undefined || !Number.isFinite(value)) return false
  if (filter.min !== undefined && value < filter.min) return false
  if (filter.max !== undefined && value >= filter.max) return false
  return true
}

/**
 * Evaluate every definition against one activity's samples, in a single pass.
 *
 * Single pass on purpose. A trace holds a few thousand samples and a library a
 * few thousand traces, so one traversal is affordable and one traversal *per
 * definition* is not — the cost would grow with the number of aggregates the
 * user happens to have saved, which is the one thing they can freely add.
 *
 * Definitions are expected to be pre-filtered by sport; `appliesToSport` is the
 * check, kept separate because the caller knows the sport and this does not.
 */
export function evaluateAggregates(
  samples: Sample[],
  definitions: CustomAggregate[]
): Record<string, AggregateAccumulator> {
  const out: Record<string, AggregateAccumulator> = {}
  if (samples.length === 0 || definitions.length === 0) return out

  const derived = deriveSeries(samples)

  const valueAt = (field: SampleField, index: number): number | undefined => {
    if (field === 'slope') return derived.slope[index]
    if (field === 'speed') {
      const stored = samples[index].speed
      return typeof stored === 'number' && Number.isFinite(stored) ? stored : derived.speed[index]
    }
    const raw = samples[index][field]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
  }

  const accumulators = new Map<string, AggregateAccumulator>(
    definitions.map(d => [d.id, { sum: 0, weight: 0 }])
  )
  // `min`/`max` start empty rather than at zero: an aggregate whose samples all
  // sit above zero must not report zero as its minimum.
  const seen = new Map<string, boolean>(definitions.map(d => [d.id, false]))

  for (let i = 0; i < samples.length; i++) {
    for (const definition of definitions) {
      if (!definition.where.every(filter => matches(filter, valueAt(filter.field, i)))) continue

      const value = valueAt(definition.measure.field, i)
      if (value === undefined) continue

      const weight =
        definition.weightBy === 'time'
          ? derived.dt[i]
          : definition.weightBy === 'distance'
            ? derived.dd[i]
            : 1

      // A sample carrying no weight cannot move a weighted average, and letting
      // it through would only inflate the significance count.
      if (weight <= 0) continue

      const accumulator = accumulators.get(definition.id)!
      const first = !seen.get(definition.id)

      switch (definition.measure.op) {
        case 'avg':
        case 'sum':
          accumulator.sum += value * weight
          break
        case 'min':
          accumulator.sum = first ? value : Math.min(accumulator.sum, value)
          break
        case 'max':
          accumulator.sum = first ? value : Math.max(accumulator.sum, value)
          break
      }

      accumulator.weight += weight
      seen.set(definition.id, true)
    }
  }

  for (const definition of definitions) {
    const accumulator = accumulators.get(definition.id)!
    // Nothing qualified, or too little of it did. Eight samples on a ramp are
    // noise, not a climbing pace, and a point drawn from them reads as data.
    if (!seen.get(definition.id)) continue
    if (definition.minWeight !== undefined && accumulator.weight < definition.minWeight) continue

    out[definition.id] = accumulator
  }

  return out
}

/**
 * Flatten the accumulators into the shape `activity_metrics` stores: plain
 * numbers, two keys per aggregate.
 */
export function toMetricValues(
  accumulators: Record<string, AggregateAccumulator>
): Record<string, number> {
  const values: Record<string, number> = {}
  for (const [id, accumulator] of Object.entries(accumulators)) {
    values[aggregateSumKey(id)] = accumulator.sum
    values[aggregateWeightKey(id)] = accumulator.weight
  }
  return values
}
