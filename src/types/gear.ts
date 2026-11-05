import type { Timestamped } from './activity'

/** What a piece of gear is, which sets its icon and its default wear limit. */
export type GearKind = 'shoes' | 'bike' | 'other'

export const GEAR_KINDS: GearKind[] = ['shoes', 'bike', 'other']

/**
 * A piece of gear the reader tracks the wear of.
 *
 * Default for some sports over a period: every outing of those sports from
 * `activeFrom` until `retiredAt` uses it, unless the outing names other gear.
 * That rule is what makes history free — creating a pair of shoes with its
 * start date covers every run since, without touching a single activity.
 */
export interface Gear extends Timestamped {
  name: string
  kind: GearKind
  /** Canonical sports it is the default for. Empty: never a default, only picked. */
  sports: string[]
  /** Start of its service, ms. */
  activeFrom: number
  /** End of its service, ms; absent while in use. */
  retiredAt?: number
  /** Metres already covered before it was tracked here. */
  initialDistance?: number
  /** Seconds already used before it was tracked here. */
  initialDuration?: number
  /** Wear limit in metres; absent for gear worn by time. */
  alertDistance?: number
  /** Wear limit in seconds; for gear worn by time (a home trainer). */
  alertDuration?: number
  notes?: string
}

export type GearInput = Omit<Gear, 'id' | 'version' | 'lastModified' | 'synced' | 'deleted'>

/** A starting wear limit per kind, in metres; the reader can change it. */
export const DEFAULT_ALERT_DISTANCE: Record<GearKind, number | undefined> = {
  shoes: 700_000,
  bike: undefined,
  other: undefined
}
