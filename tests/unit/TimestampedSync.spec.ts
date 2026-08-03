import { describe, it, expect, vi } from 'vitest'
import {
  applyConflictResolution,
  hasConflict,
  mergedRemote,
  reconcile,
  resolveConflict
} from '@/services/TimestampedSync'
import type { Timestamped } from '@/types/activity'

interface Row extends Timestamped {
  label: string
}

function row(id: string, version: number, lastModified: number, extra: Partial<Row> = {}): Row {
  return { id, version, lastModified, label: id, ...extra }
}

describe('reconcile', () => {
  it('pushes a record the remote has never seen', () => {
    const { toPush, toPull, conflicts } = reconcile([row('a', 1, 100)], [])

    expect(toPush.map(r => r.id)).toEqual(['a'])
    expect(toPull).toHaveLength(0)
    expect(conflicts).toHaveLength(0)
  })

  it('pulls a record this device has never seen', () => {
    const { toPush, toPull } = reconcile([], [row('a', 1, 100)])

    expect(toPush).toHaveLength(0)
    expect(toPull.map(r => r.id)).toEqual(['a'])
  })

  it('pushes when the local version is ahead', () => {
    const { toPush, toPull } = reconcile([row('a', 3, 200)], [row('a', 2, 100)])

    expect(toPush.map(r => r.id)).toEqual(['a'])
    expect(toPull).toHaveLength(0)
  })

  it('pulls when the remote version is ahead', () => {
    const { toPush, toPull } = reconcile([row('a', 2, 100)], [row('a', 3, 200)])

    expect(toPush).toHaveLength(0)
    expect(toPull.map(r => r.id)).toEqual(['a'])
  })

  it('moves nothing when both sides are identical', () => {
    const { toPush, toPull, conflicts } = reconcile([row('a', 2, 100)], [row('a', 2, 100)])

    expect(toPush).toHaveLength(0)
    expect(toPull).toHaveLength(0)
    expect(conflicts).toHaveLength(0)
  })

  it('reports a conflict when the same version was edited on both sides', () => {
    const { conflicts } = reconcile([row('a', 2, 300)], [row('a', 2, 200)])

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].local.lastModified).toBe(300)
    expect(conflicts[0].remote.lastModified).toBe(200)
  })
})

describe('reconcile — deletions', () => {
  /**
   * The regression this whole store exists for. The generic backup in
   * StorageService only pulls ids it does not already hold, so a row deleted
   * here still exists on the other device and comes straight back on its next
   * push. A tombstone with a higher version has to win instead.
   */
  it('pushes a local tombstone over a record the remote still holds', () => {
    const { toPush, toPull } = reconcile([row('a', 2, 200, { deleted: true })], [row('a', 1, 100)])

    expect(toPush).toHaveLength(1)
    expect(toPush[0].deleted).toBe(true)
    expect(toPull).toHaveLength(0)
  })

  it('pulls a remote tombstone for a record still alive here', () => {
    const { toPush, toPull } = reconcile([row('a', 1, 100)], [row('a', 2, 200, { deleted: true })])

    expect(toPush).toHaveLength(0)
    expect(toPull).toHaveLength(1)
    expect(toPull[0].deleted).toBe(true)
  })

  /**
   * Taking a tombstone for something we never had looks wasteful — it stores a
   * row describing the absence of a row. It is what stops the next round from
   * seeing an id the remote holds and we lack, and pulling the deleted record
   * back to life.
   */
  it('pulls a remote tombstone for an unknown record', () => {
    const { toPull } = reconcile([], [row('a', 2, 200, { deleted: true })])

    expect(toPull).toHaveLength(1)
    expect(toPull[0].deleted).toBe(true)
  })
})

describe('hasConflict / resolveConflict', () => {
  it('is not a conflict when versions differ', () => {
    expect(hasConflict(row('a', 1, 100), row('a', 2, 200))).toBe(false)
  })

  it('is not a conflict when the record is byte-identical', () => {
    expect(hasConflict(row('a', 1, 100), row('a', 1, 100))).toBe(false)
  })

  it('gives the win to the later write', () => {
    const local = row('a', 1, 300)
    const remote = row('a', 1, 200)

    expect(resolveConflict(local, remote)).toBe(local)
    expect(resolveConflict(remote, local)).toBe(local)
  })
})

describe('applyConflictResolution', () => {
  it('folds a local winner into the push list and reports it', () => {
    const onConflict = vi.fn()
    const local = row('a', 1, 300)
    const remote = row('a', 1, 200)

    const { toPush, toPull } = applyConflictResolution(reconcile([local], [remote]), onConflict)

    expect(toPush.map(r => r.id)).toEqual(['a'])
    expect(toPull).toHaveLength(0)
    expect(onConflict).toHaveBeenCalledWith(local, remote, local)
  })

  it('folds a remote winner into the pull list', () => {
    const local = row('a', 1, 100)
    const remote = row('a', 1, 400)

    const { toPush, toPull } = applyConflictResolution(reconcile([local], [remote]))

    expect(toPush).toHaveLength(0)
    expect(toPull.map(r => r.id)).toEqual(['a'])
  })
})

describe('mergedRemote', () => {
  it('replaces the pushed records and keeps the rest', () => {
    const remote = [row('a', 1, 100), row('b', 1, 100)]
    const merged = mergedRemote(remote, [row('a', 2, 200)])

    expect(merged).toHaveLength(2)
    expect(merged.find(r => r.id === 'a')?.version).toBe(2)
    expect(merged.find(r => r.id === 'b')?.version).toBe(1)
  })

  it('appends records the remote did not have', () => {
    const merged = mergedRemote([row('a', 1, 100)], [row('b', 1, 100)])

    expect(merged.map(r => r.id).sort()).toEqual(['a', 'b'])
  })
})
