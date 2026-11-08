import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'
import type { Interaction } from '@/types/interaction'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

const { getInteractionService } = await import('@/services/InteractionService')
const { getInteractionSyncService } = await import('@/services/InteractionSyncService')

/**
 * A friend's like or comment lives in *their* public files. Taking it back
 * removes it there; until now it stayed here for ever, because the reader only
 * ever added what it downloaded.
 */

let db: FakeDB

const sync = () =>
  getInteractionSyncService() as unknown as {
    syncFriendInteractions(id: string): Promise<{ success: boolean }>
    fetchManifest(url: string): Promise<unknown>
    fetchInteractionYearFile(url: string): Promise<unknown>
  }

const entry = (over: Record<string, unknown>) => ({
  type: 'like',
  activityId: 'mine',
  authorId: 'user_camille',
  authorUsername: 'camille',
  timestamp: 1,
  ...over
})

/** Camille's manifest lists these years; each year file holds these entries on my outings. */
function camillePublishes(years: Record<number, Record<string, unknown>[] | null>) {
  const s = sync()
  vi.spyOn(s, 'fetchManifest').mockResolvedValue({
    profile: { username: 'camille', userId: 'user_camille' },
    availableInteractionYears: Object.keys(years).map(y => ({
      year: Number(y),
      fileUrl: `https://x/i-${y}.json`
    }))
  })
  vi.spyOn(s, 'fetchInteractionYearFile').mockImplementation(async (url: string) => {
    const year = Number(/i-(\d+)/.exec(url)![1])
    const onMine = years[year]
    return onMine === null ? null : { interactions: { user_me: onMine } }
  })
}

const stored = async () =>
  ((await db.getAllData('interactions')) as Interaction[])
    .map(i => `${i.authorId}:${i.type}:${i.activityId}`)
    .sort()

beforeEach(async () => {
  vi.useFakeTimers()
  vi.restoreAllMocks()
  FakeDB.resetInstance()
  db = (await FakeDB.getInstance()) as FakeDB
  db.reset()
  await db.saveData('myUserId', 'user_me')
  await db.addItemsToStore(
    'friends',
    [{ id: 'f1', userId: 'user_camille', publicUrl: 'https://x/manifest.json' }],
    (f: { id: string }) => f.id
  )
})

describe('an interaction a friend takes back', () => {
  it('goes from here too, and the page is told', async () => {
    camillePublishes({
      2026: [entry({}), entry({ type: 'comment', text: 'Bravo', timestamp: 2 })]
    })
    await sync().syncFriendInteractions('f1')
    expect(await stored()).toEqual(['user_camille:comment:mine', 'user_camille:like:mine'])

    // Camille unlikes: her file now holds the comment only
    camillePublishes({ 2026: [entry({ type: 'comment', text: 'Bravo', timestamp: 2 })] })
    const removed: string[] = []
    getInteractionService().emitter.addEventListener('interaction-event', e =>
      removed.push((e as CustomEvent).detail.type)
    )
    await sync().syncFriendInteractions('f1')

    expect(await stored()).toEqual(['user_camille:comment:mine'])
    expect(removed).toContain('interaction-removed')
  })

  it('goes when the friend has nothing published any more', async () => {
    camillePublishes({ 2026: [entry({})] })
    await sync().syncFriendInteractions('f1')
    camillePublishes({})
    await sync().syncFriendInteractions('f1')
    expect(await stored()).toEqual([])
  })

  it('stays while a year could not be read: a failed download says nothing', async () => {
    camillePublishes({ 2025: [entry({ activityId: 'old', timestamp: 3 })], 2026: [entry({})] })
    await sync().syncFriendInteractions('f1')
    camillePublishes({ 2025: null, 2026: [entry({})] })
    await sync().syncFriendInteractions('f1')
    expect(await stored()).toEqual(['user_camille:like:mine', 'user_camille:like:old'])
  })

  it('never touches what someone else wrote', async () => {
    await db.addItemsToStore(
      'interactions',
      [
        {
          id: 'user_sam_like_mine_9',
          type: 'like',
          activityId: 'mine',
          activityOwnerId: 'user_me',
          authorId: 'user_sam',
          authorUsername: 'sam',
          timestamp: 9,
          lastModified: 9
        },
        {
          id: 'user_me_comment_run1_8',
          type: 'comment',
          activityId: 'run1',
          activityOwnerId: 'user_camille',
          authorId: 'user_me',
          authorUsername: 'me',
          text: 'Belle sortie',
          timestamp: 8,
          lastModified: 8
        }
      ],
      (i: { id: string }) => i.id
    )
    camillePublishes({})
    await sync().syncFriendInteractions('f1')
    expect(await stored()).toEqual(['user_me:comment:run1', 'user_sam:like:mine'])
  })
})
