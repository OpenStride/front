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

describe('liking one’s own activity', () => {
  it('is allowed: no friendship to check, and it is published like any like', async () => {
    const like = await getInteractionService().addLike('act1', 'user_me')
    expect(like).toMatchObject({ type: 'like', authorId: 'user_me', activityOwnerId: 'user_me' })
    expect(await getInteractionService().hasLiked('act1', 'user_me')).toBe(true)
  })

  it('still asks a mutual friendship on someone else’s', async () => {
    expect(await getInteractionService().addLike('act1', 'user_stranger')).toBeNull()
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
    // The network edges, stubbed: the merge of what comes back is what is tested
    const internals = sync as unknown as {
      fetchManifest(url: string): Promise<unknown>
      fetchInteractionYearFile(url: string): Promise<unknown>
    }
    vi.spyOn(internals, 'fetchManifest').mockResolvedValue({
      profile: { username: 'camille', userId: 'user_camille' },
      availableInteractionYears: [{ year: 2026, fileUrl: 'https://x/i-2026.json' }]
    })
    const entry = (over: Record<string, unknown>) => ({
      type: 'comment',
      activityId: 'run1',
      authorId: 'user_camille',
      authorUsername: 'camille',
      text: 'x',
      timestamp: 1,
      ...over
    })
    vi.spyOn(internals, 'fetchInteractionYearFile').mockResolvedValue({
      interactions: {
        // Camille's like on one of my activities
        user_me: [entry({ type: 'like', activityId: 'mine', text: undefined, timestamp: 2 })],
        // Camille's reply on her own run, where I commented, and her own like on it
        user_camille: [
          entry({ text: 'Merci !', timestamp: 3 }),
          entry({ type: 'like', text: undefined, timestamp: 5 })
        ],
        // Camille's comment on someone else's activity: none of my business
        user_other: [entry({ activityId: 'other', text: 'Bravo', timestamp: 4 })]
      }
    })

    const result = await sync.syncFriendInteractions('f1')

    expect(result.success).toBe(true)
    const stored = (await db.getAllData('interactions')) as Interaction[]
    expect(stored.map(i => [i.type, i.activityId, i.activityOwnerId, i.text ?? '']).sort()).toEqual(
      [
        ['comment', 'run1', 'user_camille', 'Merci !'],
        ['like', 'mine', 'user_me', ''],
        ['like', 'run1', 'user_camille', '']
      ]
    )
  })
})
