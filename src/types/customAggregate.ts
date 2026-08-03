import type { Timestamped } from './activity'
import type { Dimension } from './units'

/**
 * The sample fields a custom aggregate may filter on or measure.
 *
 * These names are **persisted** inside a definition, exactly like the keys of
 * `ACTIVITY_SOURCES`, so they are a contract: renaming one silently turns every
 * stored definition that used it into a filter matching nothing. Adding a name
 * is safe, removing one is not.
 *
 * `slope` is the one entry `Sample` does not carry. It is derived at scan time
 * from elevation over a fixed distance window, because there is no way to
 * express "the 2-10% sections" from the stored fields alone. Everything else
 * reads straight off the sample.
 *
 * Pace is deliberately absent. It is `1 / speed`, so offering both would give
 * two encodings of one predicate and let two definitions that look different
 * compute the same thing. A pace filter is entered as a pace by the UI and
 * stored as a speed bound; a pace *measure* is the time-weighted average of
 * `speed`, which is total distance over total time — the right answer, and one
 * the naive mean of per-sample paces does not give.
 */
export const SAMPLE_FIELDS = [
  'slope',
  'speed',
  'heartRate',
  'cadence',
  'power',
  'elevation',
  'temperature'
] as const

export type SampleField = (typeof SAMPLE_FIELDS)[number]

export function isSampleField(value: string): value is SampleField {
  return (SAMPLE_FIELDS as readonly string[]).includes(value)
}

/**
 * One band a sample must fall into to be counted.
 *
 * Bounds are **SI and only SI**: metres per second, bpm, watts, a slope as a
 * ratio (0.02, not 2). A definition syncs between devices whose display
 * preferences differ, so a bound stored in the unit it was typed in would read
 * as a different threshold on the other device.
 *
 * `min` is inclusive and `max` exclusive, so adjacent bands (0-2%, 2-10%) tile
 * without overlapping and without dropping the value on the seam.
 */
export interface SampleFilter {
  field: SampleField
  min?: number
  max?: number
}

/** How the qualifying samples collapse into one value per activity. */
export type MeasureOp = 'avg' | 'sum' | 'min' | 'max'

/**
 * What each qualifying sample counts for in an `avg`.
 *
 * `time` is almost always the right answer: a sample taken while stopped must
 * not weigh as much as one taken at speed, and an unweighted mean of speeds is
 * not the average speed. `distance` suits anything read per kilometre, `none`
 * is the plain sample count.
 */
export type WeightBy = 'time' | 'distance' | 'none'

/** How the per-activity values collapse into one point per week/month/year. */
export type PeriodOp = 'avg' | 'sum' | 'min' | 'max'

export interface AggregateMeasure {
  field: SampleField
  op: MeasureOp
}

/**
 * A user-defined aggregate: a predicate over samples plus a weighted measure.
 *
 * This is the one piece of the metrics chain that is **not** recomputable —
 * everything else in `activity_metrics` can be rebuilt from the activities, but
 * a definition is typed by hand and only exists because someone wrote it. That
 * is why it lives in its own synced store rather than in the device-local
 * cache, and why it carries the `Timestamped` fields: they are what makes a
 * conflict between two devices resolvable, and what makes a deletion stick
 * instead of being pushed back by the other device.
 */
export interface CustomAggregate extends Timestamped {
  /** User-authored, free text. NOT an i18n key — see the note below. */
  label: string
  icon?: string
  /** Lowercased sport types; empty or absent means every sport. */
  sports?: string[]
  enabled: boolean
  /** Shown at the top of the dashboard rather than in the metric list. */
  pinned?: boolean
  order?: number

  // ---- computational: any change here invalidates the cached values ----
  /** Combined with AND. An empty list measures every sample. */
  where: SampleFilter[]
  measure: AggregateMeasure
  weightBy: WeightBy
  /**
   * Below this much accumulated weight, the activity contributes no point.
   * Eight samples on a ramp are noise, not a climbing pace. SI, like the bounds.
   */
  minWeight?: number

  // ---- presentation: changing these must never trigger a recompute ----
  periodOp: PeriodOp
  betterIsLower?: boolean
  /** Passed to `units.format`; the only place a conversion factor may live. */
  dimension?: Dimension
}

/**
 * `label` is user input, so it never goes through `t()`.
 *
 * Every other label in the app is a locale key, and the contracts test exists
 * because that rule kept being broken. This is the exception the rule does not
 * cover: a translator cannot translate a name its author invented five seconds
 * ago. Reading it through `t()` would render the user's own words as a missing
 * key.
 */

/** Bumped when the meaning of a field or the derivation of `slope` changes. */
export const AGGREGATE_ALGO_VERSION = 1

type NumericInput = string | number

/**
 * FNV-1a, 32 bits, hex.
 *
 * Not a cryptographic hash and not meant to be one: it decides whether a cached
 * value is stale. A collision would keep a stale value, which the algo version
 * bump above clears, so the cost is bounded.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function numberKey(value: NumericInput | undefined): string {
  return value === undefined ? '' : String(value)
}

/**
 * A stable identity for the *computation* a definition describes.
 *
 * Deliberately not `version`, which counts edits: renaming an aggregate bumps
 * the version and must not rescan a single sample, while widening a slope band
 * by one point must rescan every one of them. One counter cannot mean both, and
 * a hand-maintained "algo version" field on the definition is a field somebody
 * forgets to bump — so it is derived, never stored.
 *
 * Filters are sorted before hashing: the same two bands entered in the other
 * order describe the same predicate and must not recompute anything.
 */
export function definitionHash(def: CustomAggregate): string {
  const filters = [...def.where]
    .map(f => `${f.field}:${numberKey(f.min)}:${numberKey(f.max)}`)
    .sort()
    .join('|')

  const sports = [...(def.sports ?? [])]
    .map(s => s.toLowerCase())
    .sort()
    .join(',')

  return fnv1a(
    [
      AGGREGATE_ALGO_VERSION,
      filters,
      def.measure.field,
      def.measure.op,
      def.weightBy,
      numberKey(def.minWeight),
      sports
    ].join('~')
  )
}

/**
 * Keys an aggregate occupies in an `activity_metrics` row.
 *
 * Two of them, never one: storing the ratio would make a monthly point the mean
 * of twelve per-activity means, weighting a 20-minute outing like a three-hour
 * one. The sum and its weight roll up correctly, the ratio does not — the same
 * reason the metric tracker's pace is a `ratio` over two sources rather than an
 * `avg` over one.
 */
export function aggregateSumKey(id: string): string {
  return `custom_${id}`
}

export function aggregateWeightKey(id: string): string {
  return `custom_${id}_w`
}
