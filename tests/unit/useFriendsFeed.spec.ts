import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ loadAllActivities: vi.fn() }))

vi.mock('@/services/ActivityFeedService', () => ({
  ActivityFeedService: {
    getInstance: () => ({ loadAllActivities: mocks.loadAllActivities })
  }
}))

const { useFriendsFeed } = await import('@/composables/useFriendsFeed')

const feedItem = (id: string, source: 'friend' | 'own') => ({
  id,
  source,
  friendUsername: source === 'friend' ? 'Zoé' : undefined,
  startTime: 1,
  duration: 1,
  distance: 1,
  type: 'running'
})

describe('useFriendsFeed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts friend activities once they are loaded', async () => {
    // `count` is a computed; it used to read a plain local variable, so the
    // number it fed stayed at zero however many activities arrived
    mocks.loadAllActivities.mockResolvedValue([
      feedItem('a', 'friend'),
      feedItem('b', 'friend'),
      feedItem('c', 'own')
    ])

    const { count, loadMore } = useFriendsFeed()
    expect(count.value).toBe(0)

    await loadMore()

    expect(count.value).toBe(2)
  })

  it('goes back to zero on reload before refilling', async () => {
    mocks.loadAllActivities.mockResolvedValue([feedItem('a', 'friend')])

    const { count, loadMore, reload } = useFriendsFeed()
    await loadMore()
    expect(count.value).toBe(1)

    mocks.loadAllActivities.mockResolvedValue([])
    await reload()

    expect(count.value).toBe(0)
  })
})
