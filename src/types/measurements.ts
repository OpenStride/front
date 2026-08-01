import type { Dimension } from './units'

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
  /** i18n key for the label. Asserted to exist in every locale by tests. */
  labelKey: string
  /**
   * Unit suffix shown when the value does not convert. Absent means none —
   * a SWOLF or a length count reads on its own.
   */
  suffixKey?: string
}

/**
 * The single place that knows what a measurement key *means*.
 *
 * Consumers render from this rather than restating it: a widget that hardcoded
 * "pool length is a distance, SWOLF is not" would be a second copy of the same
 * fact, free to drift.
 */
export const MEASUREMENTS: Record<MeasurementKey, MeasurementDefinition> = {
  // Shown as the pool it actually is (25 m, 25 yd…), not as a converted number.
  'swim.poolLength': {
    unit: 'm',
    dimension: 'poolLength',
    labelKey: 'measurements.poolLength'
  },
  'swim.lengths': { unit: 'count', labelKey: 'measurements.lengths' },
  'swim.strokes': { unit: 'count', labelKey: 'measurements.strokes' },
  'swim.strokeRate': {
    unit: 'spm',
    labelKey: 'measurements.strokeRate',
    suffixKey: 'units.spm'
  },
  // Strokes + seconds over a length. Unitless by construction, and pool-length
  // dependent, which is why it is stored rather than derived on the fly.
  'swim.swolf': { unit: 'swolf', labelKey: 'measurements.swolf' },
  'run.cadence': { unit: 'spm', labelKey: 'measurements.cadence', suffixKey: 'units.spm' },
  'bike.cadence': { unit: 'rpm', labelKey: 'measurements.cadence', suffixKey: 'units.rpm' },
  'bike.normalizedPower': {
    unit: 'W',
    labelKey: 'measurements.normalizedPower',
    suffixKey: 'units.watt'
  }
}

/** Registry keys under a namespace (`swim`, `run`, `bike`), in declaration order. */
export function measurementKeysFor(namespace: string): MeasurementKey[] {
  return MEASUREMENT_KEYS.filter(key => key.startsWith(`${namespace}.`))
}

const KEY_SET: ReadonlySet<string> = new Set(MEASUREMENT_KEYS)

/** Type guard: is this a measurement key core knows how to display? */
export function isMeasurementKey(value: string): value is MeasurementKey {
  return KEY_SET.has(value)
}
