import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'
import type { Interaction } from '@/types/interaction'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

const { getInteractionService } = await import('@/services/InteractionService')
const { getInteractionSyncService } = await import('@/services/InteractionSyncService')

let db: FakeDB

beforeEach(async () => {
  vi.useFakeTimers() // the auto-publish waits on a timer; nothing here should leave
  FakeDB.resetInstance()
  db = (await FakeDB.getInstance()) as FakeDB
  db.reset()
  await db.saveData('myUserId', 'user_me')
})

describe('commenting one’s own activity', () => {
  it('is a reply: no friendship to check', async () => {
    const reply = await getInteractionService().addComment('act1', 'user_me', 'Merci !')
    expect(reply).toMatchObject({
      authorId: 'user_me',
      activityOwnerId: 'user_me',
      text: 'Merci !'
    })
  })

  it('still asks a mutual friendship anywhere else', async () => {
    const comment = await getInteractionService().addComment('act1', 'user_stranger', 'Salut')
    expect(comment).toBeNull()
  })
})

describe('a friend’s replies reach the thread one took part in', () => {
  it('stores the owner’s replies on their activities, beside what concerns me', async () => {
    await db.addItemsToStore(
      'friends',
      [{ id: 'f1', userId: 'user_camille', publicUrl: 'https://x/manifest.json' }],
      (f: { id: string }) => f.id
    )
    const sync = getInteractionSyncService()
    vi.spyOn(sync as never, 'fetchManifest').mockResolvedValue({
      profile: { username: 'camille', userId: 'user_camille' },
      availableInteractionYears: [{ year: 2026, fileUrl: 'https://x/i-2026.json' }]
    } as never)
    const entry = (over: Record<string, unknown>) => ({
      type: 'comment',
      activityId: 'run1',
      authorId: 'user_camille',
      authorUsername: 'camille',
      text: 'x',
      timestamp: 1,
      ...over
    })
    vi.spyOn(sync as never, 'fetchInteractionYearFile').mockResolvedValue({
      interactions: {
        // Camille's like on one of my activities
        user_me: [entry({ type: 'like', activityId: 'mine', text: undefined, timestamp: 2 })],
        // Camille's reply on her own run, where I commented
        user_camille: [entry({ text: 'Merci !', timestamp: 3 })],
        // Camille's comment on someone else's activity: none of my business
        user_other: [entry({ activityId: 'other', text: 'Bravo', timestamp: 4 })]
      }
    } as never)

    const result = await sync.syncFriendInteractions('f1')

    expect(result.success).toBe(true)
    const stored = (await db.getAllData('interactions')) as Interaction[]
    expect(stored.map(i => [i.activityId, i.activityOwnerId, i.text]).sort()).toEqual([
      ['mine', 'user_me', undefined],
      ['run1', 'user_camille', 'Merci !']
    ])
  })
})
