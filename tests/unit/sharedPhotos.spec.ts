import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'
import { base64ToBytes, bytesToBase64 } from '@/utils/base64'
import type { ActivityPhoto } from '@/types/photo'
import type { PublicImage, PublicPhoto } from '@/types/friend'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())
vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({ emitter: new EventTarget() })
}))

/** Public storage in memory: one URL per file name, as Drive keeps one. */
const publicFiles = new Map<string, unknown>()
const writePublicFile = vi.fn(async (name: string, content: unknown) => {
  publicFiles.set(name, content)
  return `https://drive.google.com/uc?id=${name}&export=download`
})
const deleteFile = vi.fn(async (id: string) => {
  publicFiles.delete(id)
  return true
})
vi.mock('@/services/PublicFileService', () => ({
  PublicFileService: {
    getInstance: () => ({
      writePublicFile,
      deleteFile,
      extractFileIdFromUrl: (url: string) => /[?&]id=([^&]+)/.exec(url)?.[1] ?? null
    })
  }
}))

const { PublicPhotoPublisher, PUBLISHED_PHOTOS_KEY } =
  await import('@/services/PublicPhotoPublisher')
const { PublicDataService } = await import('@/services/PublicDataService')
const { FriendSyncService } = await import('@/services/FriendSyncService')
const { PublicKeyRing } = await import('@/services/PublicKeyRing')

let db: FakeDB

const photo = (id: string, activityId: string, takenAt = 1): ActivityPhoto => ({
  id,
  activityId,
  takenAt,
  addedAt: takenAt,
  width: 2048,
  height: 1536,
  mime: 'image/jpeg',
  size: 3,
  version: 1,
  lastModified: 1
})

async function seedPhotos(...rows: ActivityPhoto[]) {
  await db.addItemsToStore('activity_photos', rows, (r: ActivityPhoto) => r.id)
  await db.addItemsToStore(
    'photo_blobs',
    rows.map(r => ({
      id: r.id,
      full: new Blob([`full-${r.id}`], { type: 'image/jpeg' }),
      thumb: new Blob([`thumb-${r.id}`], { type: 'image/jpeg' })
    })),
    (b: { id: string }) => b.id
  )
}

const publisher = () => PublicPhotoPublisher.getInstance()
const decode = (name: string) =>
  new TextDecoder().decode(base64ToBytes((publicFiles.get(name) as PublicImage).data))

beforeEach(async () => {
  FakeDB.resetInstance()
  db = (await FakeDB.getInstance()) as FakeDB
  db.reset()
  publicFiles.clear()
  writePublicFile.mockClear()
  deleteFile.mockClear()
  await db.saveData('publicShareKey', 'key-1')
})

describe('base64', () => {
  it('round-trips any byte, past the chunk size', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })
})

describe('PublicPhotoPublisher', () => {
  it('publishes each photo as two files holding the image, and lists them by outing', async () => {
    await seedPhotos(photo('p2', 'run', 2), photo('p1', 'run', 1), photo('p3', 'ride'))

    const links = await publisher().publish(['run'])

    expect([...links.keys()]).toEqual(['run'])
    expect(links.get('run')!.map(p => p.id)).toEqual(['p1', 'p2'])
    expect(links.get('run')![0]).toMatchObject({ width: 2048, height: 1536 })
    expect(decode('photo-p1-thumb.json')).toBe('thumb-p1')
    expect(decode('photo-p1.json')).toBe('full-p1')
    expect((publicFiles.get('photo-p1.json') as PublicImage).mime).toBe('image/jpeg')
    // Not the photo of an outing that is not public
    expect(publicFiles.has('photo-p3.json')).toBe(false)
  })

  it('uploads a photo once, then only lists it', async () => {
    await seedPhotos(photo('p1', 'run'))
    await publisher().publish(['run'])
    await publisher().publish(['run'])
    expect(writePublicFile).toHaveBeenCalledTimes(2)
  })

  it('uploads again under a new key', async () => {
    await seedPhotos(photo('p1', 'run'))
    await publisher().publish(['run'])
    await db.saveData('publicShareKey', 'key-2')
    await publisher().publish(['run'])
    expect(writePublicFile).toHaveBeenCalledTimes(4)
  })

  it('leaves out a photo whose upload failed, and tries it again next time', async () => {
    await seedPhotos(photo('p1', 'run'))
    writePublicFile.mockResolvedValueOnce(null as unknown as string)
    expect((await publisher().publish(['run'])).size).toBe(0)
    expect((await publisher().publish(['run'])).get('run')).toHaveLength(1)
  })

  it('deletes the files of photos no longer shared', async () => {
    await seedPhotos(photo('p1', 'run'), photo('p2', 'run'))
    await publisher().publish(['run'])

    await publisher().prune(new Set(['p2']))

    expect(deleteFile).toHaveBeenCalledWith('photo-p1-thumb.json')
    expect(deleteFile).toHaveBeenCalledWith('photo-p1.json')
    expect(publicFiles.has('photo-p2.json')).toBe(true)
    const state = await db.getData(PUBLISHED_PHOTOS_KEY)
    expect(Object.keys(state.photos)).toEqual(['p2'])
  })

  it('forgets everything once the link changed', async () => {
    await seedPhotos(photo('p1', 'run'))
    await publisher().publish(['run'])
    await publisher().forget()
    await publisher().publish(['run'])
    expect(writePublicFile).toHaveBeenCalledTimes(4)
  })
})

describe('a public outing with photos', () => {
  const links = new Map<string, PublicPhoto[]>([
    ['run', [{ id: 'p1', thumb: 't', full: 'f', width: 2048, height: 1536 }]]
  ])

  beforeEach(async () => {
    await db.saveData('defaultPrivacy', 'public')
    await db.addItemsToStore(
      'activities',
      [
        {
          id: 'run',
          provider: 'test',
          type: 'running',
          startTime: 1_772_000_000,
          distance: 10_000,
          duration: 3000,
          version: 1,
          lastModified: 1
        }
      ],
      (a: { id: string }) => a.id
    )
  })

  it('lists them only when the reader shares photos', async () => {
    const service = PublicDataService.getInstance()
    let [run] = [...(await service.generateYearFiles(links)).values()][0].activities
    expect(run.photos).toBeUndefined()

    await db.saveData('sharingSettings', { photos: true })
    ;[run] = [...(await service.generateYearFiles(links)).values()][0].activities
    expect(run.photos).toEqual(links.get('run'))
  })

  it('names the public outings', async () => {
    expect(await PublicDataService.getInstance().listPublicActivityIds()).toEqual(['run'])
  })
})

describe("a friend's shared photo", () => {
  beforeEach(async () => {
    PublicKeyRing.reset()
    await db.addItemsToStore(
      'friends',
      [{ id: 'f1', username: 'Alex', publicUrl: 'https://x/manifest', shareKey: 'k', addedAt: 1 }],
      (f: { id: string }) => f.id
    )
  })

  it('is read with the friend’s key, decoded into an image, and fetched once', async () => {
    const sync = FriendSyncService.getInstance()
    const fetchJson = vi.spyOn(sync, 'fetchJson').mockResolvedValue({
      mime: 'image/jpeg',
      data: bytesToBase64(new TextEncoder().encode('jpg'))
    })

    const [a, b] = await Promise.all([
      sync.getSharedPhoto('f1', 'https://x/p1'),
      sync.getSharedPhoto('f1', 'https://x/p1')
    ])

    expect(await a!.text()).toBe('jpg')
    expect(a!.type).toBe('image/jpeg')
    expect(b).toBe(a)
    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(await PublicKeyRing.keyFor('https://x/p1')).toBe('k')
    fetchJson.mockRestore()
  })

  it('is tried again after a failure', async () => {
    const sync = FriendSyncService.getInstance()
    const fetchJson = vi.spyOn(sync, 'fetchJson').mockResolvedValue(null)
    expect(await sync.getSharedPhoto('f1', 'https://x/p2')).toBeNull()
    await Promise.resolve()
    await sync.getSharedPhoto('f1', 'https://x/p2')
    expect(fetchJson).toHaveBeenCalledTimes(2)
    fetchJson.mockRestore()
  })
})

describe("a friend's outing already received", () => {
  it('takes the photos its owner added since', async () => {
    await db.addItemsToStore(
      'friends',
      [
        {
          id: 'f1',
          username: 'Alex',
          publicUrl: 'https://x/manifest',
          addedAt: 1,
          syncEnabled: true
        }
      ],
      (f: { id: string }) => f.id
    )
    const sync = FriendSyncService.getInstance()
    const outing = {
      id: 'run',
      year: 2026,
      startTime: 1_772_000_000,
      duration: 3000,
      distance: 10_000,
      type: 'running'
    }
    vi.spyOn(sync, 'fetchManifest').mockResolvedValue({
      version: 1,
      lastModified: 1,
      profile: { username: 'Alex' },
      stats: { totalActivities: 1, totalDistance: 0, totalDuration: 0 },
      availableYears: []
    })
    vi.spyOn(sync, 'checkMutualFriendship').mockResolvedValue(false)
    const recent = vi.spyOn(sync, 'fetchRecentActivities').mockResolvedValue([outing])

    await sync.syncFriendActivitiesQuick('f1')
    const shared: PublicPhoto[] = [{ id: 'p1', thumb: 't', full: 'f', width: 1, height: 1 }]
    recent.mockResolvedValue([{ ...outing, photos: shared }])
    await sync.syncFriendActivitiesQuick('f1')

    const [stored] = await db.getAllData('friend_activities')
    expect(stored.photos).toEqual(shared)
    vi.restoreAllMocks()
  })
})
