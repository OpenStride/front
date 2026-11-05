import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'
import type { GearInput } from '@/types/gear'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

const { GearService } = await import('@/services/GearService')

const shoes = (fields: Partial<GearInput> = {}): GearInput => ({
  name: 'Pegasus 40',
  kind: 'shoes',
  sports: ['running'],
  activeFrom: 1_000,
  alertDistance: 700_000,
  ...fields
})

describe('GearService', () => {
  let service: InstanceType<typeof GearService>

  beforeEach(async () => {
    FakeDB.resetInstance()
    const db = (await FakeDB.getInstance()) as FakeDB
    db.reset()
    service = GearService.getInstance()
  })

  it('creates a gear as version 1, unsynced', async () => {
    const g = await service.create(shoes())
    expect(g).toMatchObject({ name: 'Pegasus 40', version: 1, synced: false })
    expect(await service.list()).toHaveLength(1)
  })

  it('bumps the version on update and tells listeners', async () => {
    const g = await service.create(shoes())
    const seen: string[][] = []
    service.emitter.addEventListener('gear-changed', e =>
      seen.push((e as CustomEvent<{ ids: string[] }>).detail.ids)
    )
    const updated = await service.update(g.id, { retiredAt: 5_000 })
    expect(updated).toMatchObject({ version: 2, retiredAt: 5_000, synced: false })
    expect(seen).toEqual([[g.id]])
  })

  it('deletes softly, so the deletion syncs', async () => {
    const g = await service.create(shoes())
    await service.markAsSynced([g.id])
    expect(await service.remove(g.id)).toBe(true)
    expect(await service.list()).toEqual([])
    const [tombstone] = await service.listAll()
    expect(tombstone).toMatchObject({ id: g.id, deleted: true, synced: false })
    expect(await service.update(g.id, { name: 'x' })).toBeNull()
  })
})
