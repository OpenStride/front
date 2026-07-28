/**
 * Unit vocabulary.
 *
 * Lives in `types/` rather than beside the composable so that anything can
 * depend on it — `plugin-context.ts` and `measurements.ts` both need these
 * names, and a type module importing a composable would invert the dependency.
 */

export type UnitSystem = 'metric' | 'imperial'

/**
 * Quantities whose display depends on the unit system.
 *
 * Cadence (spm/rpm), heart rate (bpm), power (W) and calories read the same in
 * both systems, so they are deliberately absent — they need no conversion.
 */
export type Dimension =
  | 'distance' // long distances: km / mi
  | 'distanceShort' // pool lengths, short splits: m / yd
  | 'elevation' // m / ft
  | 'speed' // m/s → km/h / mph
  | 'pace' // s/m → min/km / min/mi
  | 'pace100' // s/m → min/100 m / min/100 yd
  | 'temperature' // °C / °F

export interface Formatted {
  /** Converted and rounded, without unit. */
  value: string
  /** Localised unit label. */
  unit: string
  /** `value` and `unit`, ready to display. */
  text: string
}

/** Formats an SI value for display. Implemented by `useUnits`. */
export type FormatQuantity = (dimension: Dimension, si: number) => Formatted
