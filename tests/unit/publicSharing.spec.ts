import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

const { PublicDataService } = await import('@/services/PublicDataService')
const { FriendSyncService } = await import('@/services/FriendSyncService')

let db: FakeDB
// 7 March 2026, 07:42 local
const start = Math.floor(new Date(2026, 2, 7, 7, 42).getTime() / 1000)

beforeEach(async () => {
  FakeDB.resetInstance()
  db = (await FakeDB.getInstance()) as FakeDB
  db.reset()
  await db.saveData('defaultPrivacy', 'public')
  await db.addItemsToStore(
    'activities',
    [
      {
        id: 'run',
        provider: 'test',
        type: 'running',
        title: 'Footing du matin',
        startTime: start,
        distance: 10_000,
        duration: 3000,
        mapPolyline: [
          [45, 4],
          [45.1, 4.1]
        ],
        version: 1,
        lastModified: 1
      }
    ],
    (a: { id: string }) => a.id
  )
  await db.addItemsToStore(
    'activity_details',
    [
      {
        id: 'run',
        samples: [{ time: 0, lat: 45, lng: 4, heartRate: 140, speed: 3, distance: 0 }],
        stats: { averageHeartRate: 150, calories: 600 },
        version: 1,
        lastModified: 1
      }
    ],
    (d: { id: string }) => d.id
  )
})

const publish = () => PublicDataService.getInstance().generateAllPublicData()

describe('what a public outing carries', () => {
  it('stays as before by default: track, title, exact time, nothing more', async () => {
    const { yearFiles, detailFiles, manifest } = await publish()
    const [run] = yearFiles.get(2026)!.activities
    expect(run).toMatchObject({ title: 'Footing du matin', startTime: start })
    expect(run.mapPolyline).toBeDefined()
    expect(detailFiles.size).toBe(0)
    expect(manifest.availableYears[0].detailsUrl).toBeUndefined()
  })

  it('withholds the track, the title and the hour when asked', async () => {
    await db.saveData('sharingSettings', { map: false, title: false, time: false })
    const [run] = (await publish()).yearFiles.get(2026)!.activities
    expect(run.mapPolyline).toBeUndefined()
    expect(run.title).toBeUndefined()
    expect(new Date(run.startTime * 1000).getHours()).toBe(12)
    expect(new Date(run.startTime * 1000).getDate()).toBe(7)
  })

  it('puts figures and chart samples in a separate file, without a position', async () => {
    await db.saveData('sharingSettings', { figures: true, charts: ['heartRate'] })
    const { detailFiles } = await publish()
    expect(detailFiles.get(2026)!.activities.run).toEqual({
      stats: { averageHeartRate: 150, calories: 600 },
      samples: [{ time: 0, heartRate: 140 }]
    })
  })
})

describe('reading a friend’s shared details', () => {
  it('fetches the year’s file once, on opening, and picks the outing', async () => {
    await db.addItemsToStore(
      'friends',
      [{ id: 'f1', publicUrl: 'https://x/manifest.json' }],
      (f: { id: string }) => f.id
    )
    const sync = FriendSyncService.getInstance()
    vi.spyOn(sync, 'fetchManifest').mockResolvedValue({
      availableYears: [{ year: 2026, fileUrl: 'a', detailsUrl: 'https://x/d-2026.json' }]
    } as never)
    const fetchJson = vi.spyOn(sync, 'fetchJson').mockResolvedValue({
      year: 2026,
      activities: { run: { stats: { calories: 600 } } }
    })

    expect(await sync.getFriendActivityDetails('f1', 2026, 'run')).toEqual({
      stats: { calories: 600 }
    })
    expect(await sync.getFriendActivityDetails('f1', 2026, 'other')).toBeNull()
    expect(fetchJson).toHaveBeenCalledTimes(1)
  })
})
