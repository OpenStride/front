import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'
import { MAX_PHOTOS_PER_ACTIVITY, PHOTO_BLOB_STORE, PHOTO_STORE } from '@/types/photo'
import type { ProcessedPhoto } from '@/utils/photoImage'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

const activityEmitter = new EventTarget()
vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({ emitter: activityEmitter })
}))

const { PhotoService } = await import('@/services/PhotoService')

/** A picked file whose "taken at" the stubbed processing reads from its name. */
const file = (takenAt: number | 'broken') =>
  new File(['x'], String(takenAt), { type: 'image/jpeg' })

const processed = (takenAt: number): ProcessedPhoto => ({
  full: new Blob(['full-image'], { type: 'image/jpeg' }),
  thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
  width: 2048,
  height: 1536,
  takenAt
})

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('PhotoService', () => {
  let service: ReturnType<typeof PhotoService.getInstance>
  let db: FakeDB

  beforeEach(async () => {
    FakeDB.resetInstance()
    db = (await FakeDB.getInstance()) as FakeDB
    db.reset()
    service = PhotoService.getInstance()
    service.process = async (f: File) => {
      if (f.name === 'broken') throw new Error('cannot decode')
      return processed(Number(f.name))
    }
  })

  it('adds photos in the order they were taken, images apart from the rows', async () => {
    const result = await service.add('a1', [file(300), file(100), file(200)])

    expect(result.failed).toBe(0)
    expect(result.refused).toBe(0)
    const list = await service.list('a1')
    expect(list.map(p => p.takenAt)).toEqual([100, 200, 300])
    expect(list[0]).toMatchObject({ activityId: 'a1', version: 1, synced: false, width: 2048 })
    // The rows never carry the image: a listing stays light
    expect(list[0]).not.toHaveProperty('full')
    expect(await service.blob(list[0].id, 'thumb')).toBeInstanceOf(Blob)
    expect((await db.getAllData(PHOTO_BLOB_STORE)).length).toBe(3)
  })

  it('counts a file it cannot read without losing the others', async () => {
    const result = await service.add('a1', [file(1), file('broken'), file(2)])
    expect(result.failed).toBe(1)
    expect(result.added).toHaveLength(2)
    expect(await service.list('a1')).toHaveLength(2)
  })

  it('refuses the files past the maximum, and says how many', async () => {
    await service.add(
      'a1',
      Array.from({ length: MAX_PHOTOS_PER_ACTIVITY - 1 }, (_, i) => file(i))
    )
    const result = await service.add('a1', [file(50), file(51), file(52)])
    expect(result.added).toHaveLength(1)
    expect(result.refused).toBe(2)
    expect(await service.list('a1')).toHaveLength(MAX_PHOTOS_PER_ACTIVITY)
  })

  it("keeps each outing's photos to itself", async () => {
    await service.add('a1', [file(1)])
    await service.add('a2', [file(2), file(3)])
    expect(await service.list('a1')).toHaveLength(1)
    expect(await service.list('a2')).toHaveLength(2)
  })

  it('leaves a tombstone on removal and lets the image go', async () => {
    const [photo] = (await service.add('a1', [file(1)])).added
    const changed: string[] = []
    const off = service.onChanged(id => changed.push(id))

    expect(await service.remove(photo.id)).toBe(true)
    off()

    expect(await service.list('a1')).toEqual([])
    const row = (await db.getAllData(PHOTO_STORE))[0]
    expect(row).toMatchObject({ id: photo.id, deleted: true, version: 2, synced: false })
    expect(await service.blob(photo.id, 'full')).toBeNull()
    expect(changed).toEqual(['a1'])
    // Removing twice is a no-op
    expect(await service.remove(photo.id)).toBe(false)
  })

  it('frees room for new photos once some are removed', async () => {
    const { added } = await service.add(
      'a1',
      Array.from({ length: MAX_PHOTOS_PER_ACTIVITY }, (_, i) => file(i))
    )
    await service.remove(added[0].id)
    expect((await service.add('a1', [file(99)])).added).toHaveLength(1)
  })

  it("takes an outing's photos with it when the outing is deleted", async () => {
    await service.add('a1', [file(1), file(2)])
    await service.add('a2', [file(3)])

    activityEmitter.dispatchEvent(
      new CustomEvent('activity-changed', {
        detail: { type: 'deleted', activity: { id: 'a1' } }
      })
    )
    await flush()
    await flush()

    expect(await service.list('a1')).toEqual([])
    expect(await service.list('a2')).toHaveLength(1)
    expect((await db.getAllData(PHOTO_BLOB_STORE)).length).toBe(1)
  })
})
