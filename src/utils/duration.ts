/**
 * How a duration is written, in one place.
 *
 * A duration is the one quantity that reads the same in both unit systems, so
 * it never went through `useUnits` — and ended up reimplemented in every screen
 * that shows one. Six copies of the clock format were in the tree at once
 * (activity card, activity header, metric tracker, session bests, the recorder
 * HUD, the speed chart's axis), agreeing on the output and disagreeing on the
 * edges: one returned `-` for a missing value where the rest returned `—`, and
 * the one built on `new Date(sec * 1000).toISOString()` silently wrapped back
 * to zero past 24 h — reachable by anyone who leaves the GPS recorder running.
 */

/** Shown when there is no duration to print. Matches `useUnits`. */
const NO_VALUE = '—'

const pad = (n: number): string => String(n).padStart(2, '0')

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

interface ClockOptions {
  /** Pad the leading unit too, so widths line up in a column: "05:30". */
  padLeading?: boolean
}

/**
 * Seconds → `"38:52"`, or `"1:52:14"` once it passes the hour.
 *
 * The default drops the leading zero because that is how a time is read aloud;
 * `padLeading` keeps it for tables and tooltips that align on the colon.
 */
export function formatClock(seconds?: number, options: ClockOptions = {}): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return NO_VALUE

  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / SECONDS_PER_HOUR)
  const m = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const s = total % SECONDS_PER_MINUTE

  const leading = options.padLeading ? pad(h > 0 ? h : m) : String(h > 0 ? h : m)
  return h > 0 ? `${leading}:${pad(m)}:${pad(s)}` : `${leading}:${pad(s)}`
}

/**
 * Seconds → `"5'30\""`, or `"1h02'45\""` past the hour.
 *
 * The way a best time is read aloud, and the shape the records table has always
 * used. Distinct from `formatClock` on purpose — a record is a performance, not
 * a clock — but built here so the arithmetic stays in one file.
 */
export function formatRecordTime(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return NO_VALUE

  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / SECONDS_PER_HOUR)
  const m = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const s = total % SECONDS_PER_MINUTE

  return h > 0 ? `${h}h${pad(m)}'${pad(s)}"` : `${m}'${pad(s)}"`
}

/**
 * Seconds → `"3h05"` past the hour, `"45 min"` below it.
 *
 * The shape a total wants: nobody reads a month's training volume to the
 * second. `min` is the same token in French and English, which is why it is
 * not a locale key.
 */
export function formatCompactDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return NO_VALUE

  const totalMinutes = Math.max(0, Math.round(seconds / SECONDS_PER_MINUTE))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h${pad(m)}` : `${m} min`
}
