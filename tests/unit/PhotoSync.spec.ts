import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'
import { PHOTO_BLOB_STORE, PHOTO_STORE, type ActivityPhoto } from '@/types/photo'
import type { StoragePlugin } from '@/types/storage'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())
vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({ emitter: new EventTarget() })
}))
vi.mock('@/services/StoragePluginManager', () => ({
  StoragePluginManager: { getInstance: () => ({ getMyStoragePlugins: async () => [drive] }) }
}))

/**
 * A storage provider kept in memory: JSON stores and binary files, the two
 * things a photo needs. It outlives a "device" (the FakeDB), as Drive does.
 */
function memoryDrive() {
  const stores: Record<string, unknown[]> = {}
  const files = new Map<string, Blob>()
  let next = 0
  const plugin: StoragePlugin & { files: Map<string, Blob>; stores: typeof stores } = {
    id: 'gdrive',
    label: 'Drive',
    setupComponent: async () => ({}),
    files,
    stores,
    readRemote: async store => [...(stores[store] ?? [])],
    writeRemote: async (store, data) => {
      stores[store] = [...data]
    },
    writeFile: vi.fn(async (_name: string, content: Blob) => {
      const id = `f${++next}`
      files.set(id, content)
      return id
    }),
    readFile: vi.fn(async (id: string) => files.get(id) ?? null),
    deleteFile: vi.fn(async (id: string) => {
      files.delete(id)
      return true
    })
  }
  return plugin
}

let drive = memoryDrive()

const { PhotoService } = await import('@/services/PhotoService')
const { SyncService } = await import('@/services/SyncService')

const image = (text: string) => new Blob([text], { type: 'image/jpeg' })

/** A fresh device: empty database, same provider. */
async function newDevice() {
  FakeDB.resetInstance()
  const db = (await FakeDB.getInstance()) as FakeDB
  db.reset()
  localStorage.clear()
  const photos = PhotoService.getInstance()
  photos.process = async (f: File) => ({
    full: image(`full:${f.name}`),
    thumb: image(`thumb:${f.name}`),
    width: 2048,
    height: 1536,
    takenAt: 1
  })
  return { db, photos }
}

const syncPhotos = () =>
  (
    SyncService.getInstance() as unknown as {
      syncPhotos(p: StoragePlugin): Promise<{ errors: string[] }>
    }
  ).syncPhotos(drive)

describe('photo sync', () => {
  beforeEach(() => {
    drive = memoryDrive()
  })

  it('uploads both images, then pushes a row saying where they are', async () => {
    const { photos } = await newDevice()
    const [photo] = (await photos.add('run', [new File(['x'], 'a.jpg')])).added

    expect((await syncPhotos()).errors).toEqual([])

    expect(drive.files.size).toBe(2)
    const [row] = drive.stores[PHOTO_STORE] as ActivityPhoto[]
    expect(row.id).toBe(photo.id)
    expect(row.version).toBe(2)
    expect(await drive.files.get(row.remote!.gdrive.full)!.text()).toBe('full:a.jpg')
    expect(await drive.files.get(row.remote!.gdrive.thumb)!.text()).toBe('thumb:a.jpg')
    // Nothing left to send
    expect((await photos.listAll()).every(p => p.synced)).toBe(true)
  })

  it('does not upload the same photo twice', async () => {
    const { photos } = await newDevice()
    await photos.add('run', [new File(['x'], 'a.jpg')])
    await syncPhotos()
    await syncPhotos()
    expect(drive.writeFile).toHaveBeenCalledTimes(2)
  })

  it('shows a photo on another device, downloading it once when asked', async () => {
    const a = await newDevice()
    const [photo] = (await a.photos.add('run', [new File(['x'], 'a.jpg')])).added
    await syncPhotos()

    const b = await newDevice()
    await syncPhotos()

    expect((await b.photos.list('run')).map(p => p.id)).toEqual([photo.id])
    // Nothing downloaded until it is shown
    expect(drive.readFile).not.toHaveBeenCalled()

    const [thumb, again] = await Promise.all([
      b.photos.blob(photo.id, 'thumb'),
      b.photos.blob(photo.id, 'thumb')
    ])
    expect(await thumb!.text()).toBe('thumb:a.jpg')
    expect(again).toBe(thumb)
    expect(drive.readFile).toHaveBeenCalledTimes(1)

    // Kept: the next view reads it from the device
    await b.photos.blob(photo.id, 'thumb')
    expect(drive.readFile).toHaveBeenCalledTimes(1)
    expect(await (await b.photos.blob(photo.id, 'full'))!.text()).toBe('full:a.jpg')
    expect((await b.db.getAllData(PHOTO_BLOB_STORE))[0]).toMatchObject({ id: photo.id })
  })

  it('does not upload from a device that only downloaded part of a photo', async () => {
    const a = await newDevice()
    const [photo] = (await a.photos.add('run', [new File(['x'], 'a.jpg')])).added
    await syncPhotos()
    const b = await newDevice()
    await syncPhotos()
    await b.photos.blob(photo.id, 'thumb')
    await syncPhotos()
    expect(drive.writeFile).toHaveBeenCalledTimes(2)
  })

  it('deletes the files of a photo deleted on another device, and its images here', async () => {
    const a = await newDevice()
    const [photo] = (await a.photos.add('run', [new File(['x'], 'a.jpg')])).added
    await syncPhotos()

    const b = await newDevice()
    await syncPhotos()
    await b.photos.blob(photo.id, 'thumb')
    await b.photos.remove(photo.id)
    await syncPhotos()

    expect(drive.files.size).toBe(0)
    const [row] = drive.stores[PHOTO_STORE] as ActivityPhoto[]
    expect(row).toMatchObject({ deleted: true, remote: {} })
    expect(await b.db.getAllData(PHOTO_BLOB_STORE)).toEqual([])
  })

  it('lets the images of a photo deleted elsewhere go when the tombstone arrives', async () => {
    const { db, photos } = await newDevice()
    const [photo] = (await photos.add('run', [new File(['x'], 'a.jpg')])).added
    await syncPhotos()

    // Another device deleted it and cleaned the provider up
    const row = (drive.stores[PHOTO_STORE] as ActivityPhoto[])[0]
    drive.stores[PHOTO_STORE] = [{ ...row, deleted: true, remote: {}, version: row.version + 2 }]
    const seen: string[] = []
    photos.onChanged((id, source) => seen.push(`${id}:${source}`))
    await syncPhotos()

    expect(await photos.list('run')).toEqual([])
    expect(await db.getAllData(PHOTO_BLOB_STORE)).toEqual([])
    expect(await photos.blob(photo.id, 'full')).toBeNull()
    expect(seen).toEqual(['run:remote'])
  })

  it('retries a failed upload at the next sync, leaving no half of it behind', async () => {
    const { photos } = await newDevice()
    await photos.add('run', [new File(['x'], 'a.jpg')])
    let calls = 0
    ;(drive.writeFile as ReturnType<typeof vi.fn>).mockImplementation(
      async (_name: string, content: Blob) => {
        calls += 1
        if (calls === 2) return null // the thumbnail fails
        const id = `f${calls}`
        drive.files.set(id, content)
        return id
      }
    )

    const first = await syncPhotos()
    expect(first.errors).toHaveLength(1)
    expect(drive.files.size).toBe(0)
    expect((drive.stores[PHOTO_STORE] as ActivityPhoto[])[0].remote).toBeUndefined()

    await syncPhotos()
    expect(drive.files.size).toBe(2)
    expect((drive.stores[PHOTO_STORE] as ActivityPhoto[])[0].remote?.gdrive).toBeTruthy()
  })
})
