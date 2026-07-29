import type { Activity, ActivityDetails } from './activity'

/**
 * The numeric fields a metric may be built on, named once.
 *
 * These names are **persisted** — an aggregation config and a metric definition
 * both store one as a string — so they have to survive a refactor. They used to
 * be free-form paths (`'stats.totalAscent'`) walked at runtime by a generic
 * `getValueByPath`: renaming the field would have left every aggregation
 * silently reading `undefined`, with nothing failing and no way to notice
 * except a chart going flat.
 *
 * Written as accessors, the compiler holds the link: rename `totalAscent` and
 * this file stops compiling.
 */
export type SourceAccessor = (activity: Activity, details?: ActivityDetails) => number | undefined

export const ACTIVITY_SOURCES = {
  distance: a => a.distance,
  duration: a => a.duration,
  'stats.averageSpeed': (_, d) => d?.stats?.averageSpeed,
  'stats.maxSpeed': (_, d) => d?.stats?.maxSpeed,
  'stats.averageHeartRate': (_, d) => d?.stats?.averageHeartRate,
  'stats.maxHeartRate': (_, d) => d?.stats?.maxHeartRate,
  'stats.averageCadence': (_, d) => d?.stats?.averageCadence,
  'stats.totalAscent': (_, d) => d?.stats?.totalAscent,
  'stats.totalDescent': (_, d) => d?.stats?.totalDescent,
  'stats.calories': (_, d) => d?.stats?.calories
} satisfies Record<string, SourceAccessor>

/**
 * A field name a stored metric definition may carry.
 *
 * `satisfies` above keeps the accessors type-checked while letting this stay a
 * union of the literal keys, so an unknown name is a compile error at every
 * call site that writes one.
 */
export type ActivitySource = keyof typeof ACTIVITY_SOURCES

export function isActivitySource(ref: string): ref is ActivitySource {
  return ref in ACTIVITY_SOURCES
}

/**
 * Read one source off an activity, or `undefined` when it has no such value.
 *
 * Takes a plain `string` because the caller's value comes out of storage, where
 * a config written by an older version may name a source that no longer exists.
 */
export function readActivitySource(
  ref: string,
  activity: Activity,
  details?: ActivityDetails
): number | undefined {
  if (!isActivitySource(ref)) return undefined
  const value = ACTIVITY_SOURCES[ref](activity, details)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
