import type { Timestamped } from '@/types/activity'

/**
 * Reconciliation of one store between this device and a remote copy.
 *
 * Pure: it reads two lists and says what should move where. Every decision this
 * file makes is testable without a database, a plugin, or a network — which is
 * the point, because the rules below are the ones that were wrong before.
 */
export interface Reconciliation<T> {
  toPush: T[]
  toPull: T[]
  conflicts: Array<{ local: T; remote: T }>
}

/**
 * Same version on both sides but different timestamps: two devices edited the
 * same record from the same starting point, and neither one is a descendant of
 * the other. Mirrors `SyncService.hasConflict` for activities.
 */
export function hasConflict<T extends Timestamped>(local: T, remote: T): boolean {
  return local.version === remote.version && local.lastModified !== remote.lastModified
}

/** Last write wins. The loser is not merged, it is replaced. */
export function resolveConflict<T extends Timestamped>(local: T, remote: T): T {
  return local.lastModified > remote.lastModified ? local : remote
}

/**
 * Decide what to push and what to pull for a store of `Timestamped` records.
 *
 * Written because the generic backup in `StorageService` cannot do this. That
 * one only pulls keys it does not already have locally, which is a defensible
 * rule for a cache: it never loses a local row, and a missing one is rebuilt.
 * Applied to records a user writes it produces two failures with no error
 * anywhere — an edit made on one device never reaches the other, and a record
 * deleted on one device is pushed back by the other on its next backup. The
 * second one is the reason this exists: a deletion has to be a fact that
 * travels, and the only way to travel is as a tombstone that outranks the row
 * it replaces.
 *
 * `local` must therefore include soft-deleted rows. Filtering them out before
 * calling this would make every deletion look like a record the remote has and
 * we lack, and pull it straight back.
 */
export function reconcile<T extends Timestamped>(local: T[], remote: T[]): Reconciliation<T> {
  const localMap = new Map(local.map(r => [r.id, r]))
  const remoteMap = new Map(remote.map(r => [r.id, r]))

  const result: Reconciliation<T> = { toPush: [], toPull: [], conflicts: [] }

  for (const [id, localRecord] of localMap) {
    const remoteRecord = remoteMap.get(id)

    if (!remoteRecord) {
      result.toPush.push(localRecord)
    } else if (hasConflict(localRecord, remoteRecord)) {
      result.conflicts.push({ local: localRecord, remote: remoteRecord })
    } else if (localRecord.version > remoteRecord.version) {
      result.toPush.push(localRecord)
    } else if (remoteRecord.version > localRecord.version) {
      result.toPull.push(remoteRecord)
    }
  }

  // A tombstone reaches this branch like any other record: the remote knows an
  // id we have never seen, so we take it, deleted flag included. Storing a
  // tombstone for something that never existed locally costs one row and is
  // what stops a later sync from resurrecting it.
  for (const [id, remoteRecord] of remoteMap) {
    if (!localMap.has(id)) result.toPull.push(remoteRecord)
  }

  return result
}

/**
 * Apply the last-write-wins rule to each conflict and fold the winners into the
 * push and pull lists.
 */
export function applyConflictResolution<T extends Timestamped>(
  reconciliation: Reconciliation<T>,
  onConflict?: (local: T, remote: T, winner: T) => void
): { toPush: T[]; toPull: T[] } {
  const toPush = [...reconciliation.toPush]
  const toPull = [...reconciliation.toPull]

  for (const { local, remote } of reconciliation.conflicts) {
    const winner = resolveConflict(local, remote)
    onConflict?.(local, remote, winner)
    if (winner === local) toPush.push(local)
    else toPull.push(remote)
  }

  return { toPush, toPull }
}

/**
 * The list to write back to the remote: everything it already had, minus the
 * records we are replacing, plus ours.
 */
export function mergedRemote<T extends Timestamped>(remote: T[], toPush: T[]): T[] {
  const pushedIds = new Set(toPush.map(r => r.id))
  return [...remote.filter(r => !pushedIds.has(r.id)), ...toPush]
}
