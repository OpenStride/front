import type { Activity } from '@/types/activity'
import { getDayKey } from '@/utils/dateKeys'
import { toMs } from '@/utils/timeRange'
import { canonicalSport, sportScopes, topSportScope } from '@/types/sport'

/**
 * The figures the dashboard draws, folded from the activities it shows.
 *
 * Pure functions over the page's own list, so each block agrees with the
 * others by construction and can be tested without a browser. Everything stays
 * SI (metres, seconds); the components convert at render time.
 */

const DAY_MS = 86_400_000

/**
 * Canonical sport of an activity: an old import's `run` and a new one's
 * `running` are the same sport, and must count as one.
 */
export function sportOf(activity: Activity): string {
  return canonicalSport(activity.type) || 'other'
}

function startOf(activity: Activity): number | null {
  if (activity.deleted) return null
  const ms = toMs(activity.startTime)
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

function finite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Midnight on the Monday of the week `date` sits in, local time. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * The sport the reader does most, to open the dashboard on.
 *
 * Pace, records and a distance total only mean something for one sport at a
 * time; "all sports" is the exception a reader picks, not the default they
 * have to leave.
 */
export function mainSport(activities: Activity[]): string {
  // Counted by menu choice, so trails and road runs add up to "running".
  const scopes = sportScopes(activities.map(a => a.type))
  const counts = new Map<string, number>()
  for (const a of activities) {
    if (startOf(a) === null) continue
    const s = topSportScope(sportOf(a), scopes)
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  let best = ''
  let bestCount = 0
  for (const [sport, count] of counts) {
    if (count > bestCount) {
      best = sport
      bestCount = count
    }
  }
  return best
}

export interface Totals {
  /** Metres. */
  distance: number
  /** Seconds. */
  duration: number
  /** Metres climbed, over the outings whose ascent is known. */
  ascent: number
  count: number
}

const empty = (): Totals => ({ distance: 0, duration: 0, ascent: 0, count: 0 })

function add(t: Totals, a: Activity, ascentOf: (id: string) => number | undefined) {
  t.distance += finite(a.distance)
  t.duration += finite(a.duration)
  t.ascent += finite(ascentOf(a.id))
  t.count += 1
}

export interface WeekSummary {
  current: Totals
  /**
   * The week before, up to the same moment. A Tuesday compared with a whole
   * week read as a collapse every Tuesday.
   */
  previousSoFar: Totals
  /** One entry per day, Monday first. */
  days: { date: Date; distance: number; duration: number; isToday: boolean; isFuture: boolean }[]
}

export function weekSummary(
  activities: Activity[],
  ascentOf: (id: string) => number | undefined,
  now: Date = new Date()
): WeekSummary {
  const start = weekStart(now).getTime()
  const end = addDays(new Date(start), 7).getTime()
  const prevStart = addDays(new Date(start), -7).getTime()
  const prevCutoff = now.getTime() - 7 * DAY_MS

  const current = empty()
  const previousSoFar = empty()
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(new Date(start), i)
    return {
      date,
      distance: 0,
      duration: 0,
      isToday: getDayKey(date) === getDayKey(now),
      isFuture: date.getTime() > now.getTime()
    }
  })

  for (const a of activities) {
    const ms = startOf(a)
    if (ms === null) continue
    if (ms >= start && ms < end) {
      add(current, a, ascentOf)
      // By calendar day, not by 24 h steps: a week holding a clock change has
      // a 23 h or 25 h day, and a Sunday run would slip into Saturday.
      const day = days[(new Date(ms).getDay() + 6) % 7]
      day.distance += finite(a.distance)
      day.duration += finite(a.duration)
    } else if (ms >= prevStart && ms <= prevCutoff) {
      add(previousSoFar, a, ascentOf)
    }
  }

  return { current, previousSoFar, days }
}

export interface WeekBucket {
  /** Monday of the week. */
  start: Date
  isCurrent: boolean
  /** SI totals per sport. */
  bySport: Record<string, { distance: number; duration: number }>
  distance: number
  duration: number
}

/** The last `count` weeks, oldest first, the current one last. */
export function weeklySeries(
  activities: Activity[],
  count = 12,
  now: Date = new Date()
): WeekBucket[] {
  const current = weekStart(now)
  const weeks: WeekBucket[] = Array.from({ length: count }, (_, i) => ({
    start: addDays(current, (i - count + 1) * 7),
    isCurrent: i === count - 1,
    bySport: {},
    distance: 0,
    duration: 0
  }))
  const first = weeks[0].start.getTime()
  const end = addDays(current, 7).getTime()

  for (const a of activities) {
    const ms = startOf(a)
    if (ms === null || ms < first || ms >= end) continue
    const week = weeks.find((w, i) => {
      const next = i + 1 < weeks.length ? weeks[i + 1].start.getTime() : end
      return ms >= w.start.getTime() && ms < next
    })
    if (!week) continue
    const sport = sportOf(a)
    const slot = (week.bySport[sport] ??= { distance: 0, duration: 0 })
    slot.distance += finite(a.distance)
    slot.duration += finite(a.duration)
    week.distance += finite(a.distance)
    week.duration += finite(a.duration)
  }
  return weeks
}

/**
 * Average speed of each week, in metres per second: total distance over total
 * time, so a long slow run weighs what it lasted rather than counting as one
 * vote. Null for a week with nothing to divide.
 */
export function weeklySpeed(weeks: WeekBucket[]): (number | null)[] {
  return weeks.map(w => (w.distance > 0 && w.duration > 0 ? w.distance / w.duration : null))
}

/** Seconds spent per sport over the given weeks, largest first. */
export function timeBySport(weeks: WeekBucket[]): { sport: string; duration: number }[] {
  const totals = new Map<string, number>()
  for (const w of weeks) {
    for (const [sport, v] of Object.entries(w.bySport)) {
      totals.set(sport, (totals.get(sport) ?? 0) + v.duration)
    }
  }
  return [...totals.entries()]
    .filter(([, d]) => d > 0)
    .map(([sport, duration]) => ({ sport, duration }))
    .sort((a, b) => b.duration - a.duration)
}

/** How many of the last `count` weeks hold at least one outing. */
export function activeWeeks(activities: Activity[], count: number, now: Date = new Date()): number {
  return weeklySeries(activities, count, now).filter(w => Object.keys(w.bySport).length > 0).length
}
