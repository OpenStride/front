import type { Activity } from '@/types/activity'
import type { Gear } from '@/types/gear'
import { canonicalSport } from '@/types/sport'
import { toMs } from '@/utils/timeRange'

/**
 * Which gear an activity used.
 *
 * The reader's own choice when there is one (an empty list included: "none").
 * Otherwise the gear that was the default for the activity's sport on its
 * date — one per kind, the most recently started when two overlap, since a
 * new pair usually takes over from the old one before the old one is retired.
 */
export function resolveGear(activity: Activity, gear: Gear[]): Gear[] {
  if (Array.isArray(activity.gearIds)) {
    const byId = new Map(gear.map(g => [g.id, g]))
    return activity.gearIds.map(id => byId.get(id)).filter((g): g is Gear => !!g && !g.deleted)
  }
  return defaultGear(activity, gear)
}

/** The gear that is the default for this activity's sport and date. */
export function defaultGear(activity: Activity, gear: Gear[]): Gear[] {
  const sport = canonicalSport(activity.type)
  const at = toMs(activity.startTime)
  const candidates = gear
    .filter(
      g =>
        !g.deleted &&
        g.sports.includes(sport) &&
        g.activeFrom <= at &&
        (g.retiredAt === undefined || at < g.retiredAt)
    )
    .sort((a, b) => b.activeFrom - a.activeFrom)
  const byKind = new Map<string, Gear>()
  for (const g of candidates) if (!byKind.has(g.kind)) byKind.set(g.kind, g)
  return [...byKind.values()]
}

/** Whether this activity's gear comes from the default rule rather than a choice. */
export function isDefaultChoice(activity: Activity): boolean {
  return !Array.isArray(activity.gearIds)
}

export interface GearUsage {
  /** Metres, prior use included. */
  distance: number
  /** Seconds, prior use included. */
  duration: number
  count: number
  /** Start time of the latest outing, ms. */
  lastUsed: number | null
}

/** Wear of every gear, from the activities that resolve to it. */
export function gearUsage(activities: Activity[], gear: Gear[]): Map<string, GearUsage> {
  const usage = new Map<string, GearUsage>()
  for (const g of gear) {
    usage.set(g.id, {
      distance: g.initialDistance ?? 0,
      duration: g.initialDuration ?? 0,
      count: 0,
      lastUsed: null
    })
  }
  for (const a of activities) {
    if (a.deleted) continue
    for (const g of resolveGear(a, gear)) {
      const u = usage.get(g.id)
      if (!u) continue
      u.distance += a.distance || 0
      u.duration += a.duration || 0
      u.count += 1
      const t = toMs(a.startTime)
      if (u.lastUsed === null || t > u.lastUsed) u.lastUsed = t
    }
  }
  return usage
}

export type WearLevel = 'ok' | 'warn' | 'over'

/** Orange from this share of the wear limit. */
export const WARN_RATIO = 0.8

/** Share of the wear limit used: by distance when there is one, else by time; 0 without a limit. */
export function wearRatio(gear: Gear, usage: GearUsage | undefined): number {
  if (!usage) return 0
  if (gear.alertDistance) return usage.distance / gear.alertDistance
  if (gear.alertDuration) return usage.duration / gear.alertDuration
  return 0
}

/**
 * How worn the gear is against its own limit: by distance when it has one,
 * else by time. No limit, no alarm; retired, no alarm either.
 */
export function wearLevel(gear: Gear, usage: GearUsage | undefined): WearLevel {
  // Retired gear is already replaced: nothing left to warn about.
  if (gear.retiredAt !== undefined) return 'ok'
  const ratio = wearRatio(gear, usage)
  if (ratio >= 1) return 'over'
  if (ratio >= WARN_RATIO) return 'warn'
  return 'ok'
}

/**
 * The gear choice to carry over when a sync conflict replaces `loser` with
 * `winner`, or null when the winner's own choice is the latest.
 *
 * A conflict keeps the newer record whole — usually because a provider
 * update touched it. Without this, a gear picked on one device would vanish
 * whenever a provider update reached the same outing on another before they
 * synced. The choice carries its own time, so the latest one survives.
 */
export function gearChoiceToKeep(
  winner: Activity,
  loser: Activity
): Pick<Activity, 'gearIds' | 'gearSetAt'> | null {
  if ((loser.gearSetAt ?? 0) <= (winner.gearSetAt ?? 0)) return null
  return { gearIds: loser.gearIds, gearSetAt: loser.gearSetAt }
}
