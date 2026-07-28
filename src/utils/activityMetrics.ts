import { getSportProfile } from '@/types/sport'
import { MEASUREMENTS, type MeasurementKey } from '@/types/measurements'
import type { Dimension, Formatted, FormatQuantity } from '@/types/units'
import type { Measurement } from '@/types/activity'

/**
 * What to format for an activity's headline metric, and with which dimension.
 *
 * Returns a spec rather than a formatted string so the caller supplies its own
 * formatter: core components get it from `useUnits`, plugins from
 * `ctx.units` — plugins must not import core services.
 *
 * Both call sites used to carry their own copy of the "profile kind → dimension"
 * mapping, with different input conventions (m/s in one, s/m in the other),
 * which is exactly how two implementations of one rule drift apart.
 */
export interface MetricSpec {
  dimension: Dimension
  /** SI value in that dimension's canonical unit. */
  si: number
}

export interface MetricInput {
  /** Metres. */
  distance?: number
  /** Seconds. */
  duration?: number
  /** Metres per second, when the provider gives an average directly. */
  speed?: number
  /**
   * Total ascent in metres. Only the detail page has it — the feed card holds
   * an `Activity`, not its details — so sports that headline elevation fall
   * back to their motion metric when it is absent.
   */
  ascent?: number
}

/**
 * Null when the sport has no meaningful pace or speed (gym, yoga), so callers
 * can drop the slot rather than print a placeholder.
 */
export function primaryMetricSpec(sport: string, input: MetricInput): MetricSpec | null {
  const profile = getSportProfile(sport)
  let kind = profile.primaryMetric
  if (kind === 'none') return null

  if (kind === 'elevation') {
    if (input.ascent != null) return { dimension: 'elevation', si: input.ascent }
    // No ascent to hand: show how they moved rather than a blank slot.
    kind = 'pace'
  }

  // Prefer the provider's average; fall back to the overall distance/duration.
  const metersPerSecond =
    input.speed && input.speed > 0
      ? input.speed
      : input.distance && input.duration
        ? input.distance / input.duration
        : NaN

  if (kind === 'speed') return { dimension: 'speed', si: metersPerSecond }

  // Pace dimensions take seconds per metre.
  return {
    dimension: kind === 'pace100' ? 'pace100' : 'pace',
    si: metersPerSecond > 0 ? 1 / metersPerSecond : NaN
  }
}

/** Dimension for an activity's total distance, per the sport's scale. */
export function distanceDimension(sport: string): Dimension {
  return getSportProfile(sport).distanceScale === 'short' ? 'distanceShort' : 'distance'
}

/**
 * Render a stored measurement using the registry's own description of it.
 *
 * Keeping this here rather than in each widget is the point: whether a key
 * converts is a property of the key, stated once in `MEASUREMENTS`.
 */
export function formatMeasurement(
  key: MeasurementKey,
  measurement: Measurement,
  format: FormatQuantity,
  translate: (key: string) => string
): Formatted {
  const definition = MEASUREMENTS[key]
  if (definition.dimension) return format(definition.dimension, measurement.value)

  const value = Math.round(measurement.value).toString()
  const unit = definition.suffixKey ? translate(definition.suffixKey) : ''
  return { value, unit, text: unit ? `${value} ${unit}` : value }
}
