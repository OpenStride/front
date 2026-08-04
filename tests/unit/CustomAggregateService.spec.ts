import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'
import type { CustomAggregateInput } from '@/services/CustomAggregateService'
import { definitionHash } from '@/types/customAggregate'
import type { CustomAggregate } from '@/types/customAggregate'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

const { CustomAggregateService } = await import('@/services/CustomAggregateService')

/** "Average pace on 2-10% climbs" — the example the whole feature is for. */
function climbPace(overrides: Partial<CustomAggregateInput> = {}): CustomAggregateInput {
  return {
    label: 'Allure en côte',
    enabled: true,
    where: [{ field: 'slope', min: 0.02, max: 0.1 }],
    measure: { field: 'speed', op: 'avg' },
    weightBy: 'time',
    periodOp: 'avg',
    betterIsLower: true,
    dimension: 'pace',
    ...overrides
  }
}

describe('CustomAggregateService', () => {
  let service: InstanceType<typeof CustomAggregateService>

  beforeEach(async () => {
    FakeDB.resetInstance()
    const db = (await FakeDB.getInstance()) as FakeDB
    db.reset()
    service = CustomAggregateService.getInstance()
  })

  describe('create', () => {
    it('stamps a fresh definition as version 1 and unsynced', async () => {
      const created = await service.create(climbPace())

      expect(created.id).toBeTruthy()
      expect(created.version).toBe(1)
      expect(created.synced).toBe(false)
      expect(created.lastModified).toBeGreaterThan(0)
    })

    it('gives two definitions distinct ids', async () => {
      const a = await service.create(climbPace())
      const b = await service.create(climbPace({ label: 'Autre' }))

      expect(a.id).not.toBe(b.id)
      expect(await service.list()).toHaveLength(2)
    })
  })

  describe('update', () => {
    it('bumps the version and marks the record unsynced again', async () => {
      const created = await service.create(climbPace())
      await service.markAsSynced([created.id])

      const updated = await service.update(created.id, { label: 'Renommé' })

      expect(updated?.id).toBe(created.id)
      expect(updated?.version).toBe(2)
      expect(updated?.synced).toBe(false)
      expect(updated?.label).toBe('Renommé')
    })

    it('returns null for an unknown id', async () => {
      expect(await service.update('nope', { label: 'x' })).toBeNull()
    })
  })

  describe('remove', () => {
    it('keeps a tombstone out of the live list but inside the sync list', async () => {
      const created = await service.create(climbPace())

      expect(await service.remove(created.id)).toBe(true)
      expect(await service.list()).toHaveLength(0)

      const all = await service.listAll()
      expect(all).toHaveLength(1)
      expect(all[0].deleted).toBe(true)
      expect(all[0].version).toBe(2)
      expect(all[0].synced).toBe(false)
    })

    it('disables the definition so nothing keeps computing it', async () => {
      const created = await service.create(climbPace())
      await service.remove(created.id)

      expect((await service.listAll())[0].enabled).toBe(false)
    })

    it('refuses to delete twice', async () => {
      const created = await service.create(climbPace())
      await service.remove(created.id)

      expect(await service.remove(created.id)).toBe(false)
    })

    /**
     * Writing over a tombstone would reset it to a live record at a version the
     * remote copy can beat, and the deletion would be undone at the next sync.
     */
    it('refuses to update a deleted definition', async () => {
      const created = await service.create(climbPace())
      await service.remove(created.id)

      expect(await service.update(created.id, { label: 'revenu' })).toBeNull()
    })
  })

  describe('sync bookkeeping', () => {
    it('reports tombstones as unsynced so the deletion travels', async () => {
      const created = await service.create(climbPace())
      await service.markAsSynced([created.id])
      await service.remove(created.id)

      const unsynced = await service.getUnsynced()
      expect(unsynced).toHaveLength(1)
      expect(unsynced[0].deleted).toBe(true)
    })

    it('marks pulled records as synced so they are not pushed straight back', async () => {
      const remote: CustomAggregate = {
        ...climbPace(),
        id: 'remote-1',
        version: 4,
        lastModified: 1234,
        synced: false
      }

      await service.applyRemote([remote])

      const stored = await service.get('remote-1')
      expect(stored?.synced).toBe(true)
      expect(stored?.version).toBe(4)
      expect(await service.getUnsynced()).toHaveLength(0)
    })

    it('emits a change event carrying the touched ids', async () => {
      const seen: string[][] = []
      service.emitter.addEventListener('aggregates-changed', (e: Event) => {
        seen.push((e as CustomEvent<{ ids: string[] }>).detail.ids)
      })

      const created = await service.create(climbPace())
      await service.remove(created.id)

      expect(seen).toEqual([[created.id], [created.id]])
    })
  })
})

describe('definitionHash', () => {
  const base: CustomAggregate = {
    ...climbPace(),
    id: 'a',
    version: 1,
    lastModified: 0
  }

  it('is stable for the same computation', () => {
    expect(definitionHash(base)).toBe(definitionHash({ ...base }))
  })

  /**
   * The reason the hash exists rather than a version counter: renaming an
   * aggregate must not rescan a single sample of a single activity.
   */
  it('ignores everything that only affects display', () => {
    const renamed: CustomAggregate = {
      ...base,
      label: 'Tout autre nom',
      icon: 'fas fa-mountain',
      pinned: true,
      order: 3,
      enabled: false,
      periodOp: 'max',
      betterIsLower: false,
      dimension: 'speed',
      version: 12,
      lastModified: 99999
    }

    expect(definitionHash(renamed)).toBe(definitionHash(base))
  })

  it('changes when a filter bound moves', () => {
    const widened: CustomAggregate = {
      ...base,
      where: [{ field: 'slope', min: 0.02, max: 0.12 }]
    }

    expect(definitionHash(widened)).not.toBe(definitionHash(base))
  })

  it('changes when the measured field or its operator changes', () => {
    expect(definitionHash({ ...base, measure: { field: 'heartRate', op: 'avg' } })).not.toBe(
      definitionHash(base)
    )
    expect(definitionHash({ ...base, measure: { field: 'speed', op: 'max' } })).not.toBe(
      definitionHash(base)
    )
  })

  it('changes when the weighting changes', () => {
    expect(definitionHash({ ...base, weightBy: 'distance' })).not.toBe(definitionHash(base))
  })

  it('changes when the significance floor moves', () => {
    expect(definitionHash({ ...base, minWeight: 60 })).not.toBe(definitionHash(base))
  })

  /** The same predicate typed in the other order is the same predicate. */
  it('ignores the order filters were entered in', () => {
    const first: CustomAggregate = {
      ...base,
      where: [
        { field: 'slope', min: 0.02, max: 0.1 },
        { field: 'heartRate', min: 140 }
      ]
    }
    const second: CustomAggregate = { ...first, where: [...first.where].reverse() }

    expect(definitionHash(second)).toBe(definitionHash(first))
  })

  it('ignores the order and casing of the sport list', () => {
    const a: CustomAggregate = { ...base, sports: ['running', 'trail'] }
    const b: CustomAggregate = { ...base, sports: ['TRAIL', 'Running'] }

    expect(definitionHash(b)).toBe(definitionHash(a))
  })

  it('separates a sport-scoped definition from an unscoped one', () => {
    expect(definitionHash({ ...base, sports: ['running'] })).not.toBe(definitionHash(base))
  })
})
