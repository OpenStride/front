import type { Dimension } from '@/composables/useUnits'

/**
 * Measurement keys core knows how to display.
 *
 * `ActivityDetails.measurements` is an open map so providers can contribute
 * without core changing. This registry is the other half of that bargain: keys
 * listed here get a label and a known unit, anything else is stored faithfully
 * but not rendered by default. Without it the vocabulary drifts the moment a
 * second provider lands (`swim.swolf` vs `swimming.swolf`).
 *
 * Same pattern as SPORT_TYPES: a const array usable as a type and at runtime,
 * with tests asserting every key has an i18n label in every locale.
 */
export const MEASUREMENT_KEYS = [
  // Swimming
  'swim.poolLength',
  'swim.lengths',
  'swim.strokes',
  'swim.strokeRate',
  'swim.swolf',
  // Running
  'run.cadence',
  // Cycling
  'bike.cadence',
  'bike.normalizedPower'
] as const

export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number]

export interface MeasurementDefinition {
  /** Canonical unit values are stored in. */
  unit: string
  /**
   * How to convert for display. Absent means the value is unit-system
   * independent (strokes, cadence, counts) and is shown as stored.
   */
  dimension?: Dimension
  /** Decimal places when shown raw (dimensionless values only). */
  precision?: number
}

export const MEASUREMENTS: Record<MeasurementKey, MeasurementDefinition> = {
  // A 25 m pool is 25 yd to an imperial swimmer, so this one does convert.
  'swim.poolLength': { unit: 'm', dimension: 'distanceShort' },
  'swim.lengths': { unit: 'count' },
  'swim.strokes': { unit: 'count' },
  'swim.strokeRate': { unit: 'spm' },
  // Strokes + seconds over a length. Unitless by construction, and pool-length
  // dependent, which is why it is stored rather than derived on the fly.
  'swim.swolf': { unit: 'swolf' },
  'run.cadence': { unit: 'spm' },
  'bike.cadence': { unit: 'rpm' },
  'bike.normalizedPower': { unit: 'W' }
}

const KEY_SET: ReadonlySet<string> = new Set(MEASUREMENT_KEYS)

/** Type guard: is this a measurement key core knows how to display? */
export function isMeasurementKey(value: string): value is MeasurementKey {
  return KEY_SET.has(value)
}
