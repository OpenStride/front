import type { Activity, ActivityDetails } from '@/types/activity'
import { isSportType } from '@/types/sport'
import { isMeasurementKey, MEASUREMENTS } from '@/types/measurements'

/**
 * The contract a data-provider plugin owes core when it writes an activity.
 *
 * The design already says what the shape must be — canonical sport slugs, SI
 * units, measurement keys drawn from the registry — but nothing checked it.
 * The one provider that ignored it shipped and stayed broken: it lowercased raw
 * sport strings, so "Trail Running" became "trail running", fell through to the
 * `other` profile and lost its headline metric. A test naming each provider by
 * hand could not catch it either, because it only named the two that were
 * already correct.
 *
 * This checks at the door every provider must pass through, so a provider added
 * tomorrow is covered without anyone remembering to list it.
 */
export interface ContractViolation {
  field: string
  message: string
}

/** Physically implausible values, wide enough to only catch unit mistakes. */
const MAX_PLAUSIBLE_SPEED_MS = 60 // 216 km/h — beyond any human-powered sport
const MAX_PLAUSIBLE_DISTANCE_M = 2_000_000 // 2000 km in one activity

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Violations of the storage contract, empty when the activity conforms.
 *
 * Pure and side-effect free: callers decide what to do about the result.
 */
export function checkActivityContract(
  activity: Activity,
  details?: ActivityDetails
): ContractViolation[] {
  const out: ContractViolation[] = []

  // ── Sport vocabulary ───────────────────────────────────────────────────────
  // Providers must map onto the canonical slugs. Anything else silently loses
  // its presentation profile.
  if (!activity.type) {
    out.push({ field: 'type', message: 'missing sport type' })
  } else if (!isSportType(activity.type.toLowerCase())) {
    out.push({
      field: 'type',
      message: `"${activity.type}" is not a canonical SportType — map it in the provider's sportTypes.ts`
    })
  }

  // ── SI units ───────────────────────────────────────────────────────────────
  // Distances are metres and durations seconds. A provider handing over
  // kilometres would look plausible everywhere until a total came out 1000x
  // small, so the bounds catch the mistake rather than the value.
  if (activity.distance != null) {
    if (!finite(activity.distance) || activity.distance < 0) {
      out.push({ field: 'distance', message: 'distance must be a positive number of metres' })
    } else if (activity.distance > MAX_PLAUSIBLE_DISTANCE_M) {
      out.push({
        field: 'distance',
        message: `${activity.distance} is implausible for metres — is this another unit?`
      })
    }
  }

  if (activity.duration != null && (!finite(activity.duration) || activity.duration < 0)) {
    out.push({ field: 'duration', message: 'duration must be a positive number of seconds' })
  }

  const speed = details?.stats?.averageSpeed
  if (speed != null && (!finite(speed) || speed < 0 || speed > MAX_PLAUSIBLE_SPEED_MS)) {
    out.push({
      field: 'stats.averageSpeed',
      message: `${speed} is implausible for metres per second — km/h by mistake?`
    })
  }

  // ── Measurement registry ───────────────────────────────────────────────────
  // Unknown keys are stored faithfully but nothing renders them, and a key
  // whose unit disagrees with the registry would be converted as something else.
  for (const [key, measurement] of Object.entries(details?.measurements ?? {})) {
    if (!isMeasurementKey(key)) {
      out.push({
        field: `measurements.${key}`,
        message: 'not in the measurement registry — nothing will display it'
      })
      continue
    }
    const expected = MEASUREMENTS[key].unit
    if (measurement.unit !== expected) {
      out.push({
        field: `measurements.${key}`,
        message: `unit "${measurement.unit}" disagrees with the registry ("${expected}")`
      })
    }
    if (!finite(measurement.value)) {
      out.push({ field: `measurements.${key}`, message: 'value is not a finite number' })
    }
  }

  return out
}

/**
 * Report violations to the developer without breaking the import.
 *
 * Deliberately not a throw: real databases hold activities from before the
 * canonical vocabulary, and refusing them would lose data the app otherwise
 * renders fine. Silent in production — this is a message to whoever writes a
 * provider, not to the user.
 */
export function warnOnContractViolations(activity: Activity, details?: ActivityDetails): void {
  if (!import.meta.env.DEV) return
  const violations = checkActivityContract(activity, details)
  if (violations.length === 0) return

  console.warn(
    `[contract] activity "${activity.id}" from provider "${activity.provider}" ` +
      `breaks the storage contract:\n` +
      violations.map(v => `  • ${v.field}: ${v.message}`).join('\n')
  )
}
