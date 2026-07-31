import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActivityFeedService } from '@/services/ActivityFeedService'
import { createActivity } from '../fixtures/activities'

const stores: Record<string, unknown[]> = { activities: [], friend_activities: [] }

vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: {
    getInstance: async () => ({
      getAllData: async (store: string) => [...(stores[store] ?? [])]
    })
  }
}))

const service = ActivityFeedService.getInstance()

const at = (iso: string) => new Date(iso).getTime()

const friendActivity = (over: Record<string, unknown> = {}) => ({
  activityId: 'f-1',
  friendId: 'friend-1',
  friendUsername: 'alex',
  startTime: at('2026-01-10T08:00:00Z'),
  duration: 3600,
  distance: 30000,
  type: 'cycling',
  title: 'Club Ride',
  ...over
})

describe('ActivityFeedService — merging both sides', () => {
  beforeEach(() => {
    stores.activities = []
    stores.friend_activities = []
  })

  // The store keeps a deleted record around so the sync can propagate the
  // deletion. Only the activity list was filtering them out, so deleting an
  // outing removed it from one screen and left it on the other.
  it('leaves soft-deleted activities out of the feed', async () => {
    stores.activities = [
      createActivity({ id: 'kept' }),
      createActivity({ id: 'gone', deleted: true })
    ]

    const feed = await service.loadAllActivities()

    expect(feed.map(a => a.id)).toEqual(['kept'])
  })

  it('marks where each activity came from', async () => {
    stores.activities = [createActivity({ id: 'mine' })]
    stores.friend_activities = [friendActivity()]

    const feed = await service.loadAllActivities()

    expect(feed.find(a => a.id === 'mine')?.source).toBe('own')
    const theirs = feed.find(a => a.id === 'f-1')
    expect(theirs?.source).toBe('friend')
    expect(theirs?.friendUsername).toBe('alex')
  })

  describe('ordering', () => {
    it('puts the most recent first', async () => {
      stores.activities = [
        createActivity({ id: 'older', startTime: at('2026-01-01T08:00:00Z') }),
        createActivity({ id: 'newer', startTime: at('2026-01-20T08:00:00Z') })
      ]

      expect((await service.loadAllActivities()).map(a => a.id)).toEqual(['newer', 'older'])
    })

    // The two sides of the merge do not agree on the unit: an activity stored
    // in seconds would sort below 1970 and sink to the bottom of the feed.
    it('reads a timestamp stored in seconds', async () => {
      stores.activities = [
        createActivity({ id: 'ms', startTime: at('2026-01-01T08:00:00Z') }),
        createActivity({ id: 'seconds', startTime: at('2026-06-01T08:00:00Z') / 1000 })
      ]

      expect((await service.loadAllActivities()).map(a => a.id)).toEqual(['seconds', 'ms'])
    })
  })

  it('counts each side separately', async () => {
    stores.activities = [createActivity({ id: 'a' }), createActivity({ id: 'b' })]
    stores.friend_activities = [friendActivity()]

    const counts = service.getActivityCounts(await service.loadAllActivities())

    expect(counts).toEqual({ own: 2, friends: 1, total: 3 })
  })
})
