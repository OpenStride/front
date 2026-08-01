import { describe, it, expect, vi, beforeEach } from 'vitest'
import { watch, nextTick } from 'vue'

const makeActivity = (i: number) => ({
  id: `act-${i}`,
  version: 1,
  lastModified: i,
  date: new Date(2026, 0, i + 1).toISOString(),
  source: 'own' as const
})

let stored: ReturnType<typeof makeActivity>[] = []

vi.mock('@/services/ActivityFeedService', () => ({
  ActivityFeedService: {
    getInstance: () => ({
      loadAllActivities: async () => [...stored],
      getActivityCounts: (list: unknown[]) => ({
        own: list.length,
        friends: 0,
        total: list.length
      })
    })
  }
}))

import { useMixedFeed } from '@/composables/useMixedFeed'

describe('useMixedFeed.reload', () => {
  beforeEach(() => {
    stored = Array.from({ length: 25 }, (_, i) => makeActivity(i))
  })

  it('never empties the list while refreshing', async () => {
    const { activities, loadMore, reload } = useMixedFeed()
    await loadMore()
    expect(activities.value).toHaveLength(10)

    // Emptying the list would unmount every card — and every Leaflet map with
    // it. Watch every intermediate value, not just the final one.
    const seen: number[] = []
    watch(activities, list => seen.push(list.length), { deep: false })

    await reload()
    await nextTick()

    expect(seen).not.toContain(0)
    expect(activities.value).toHaveLength(10)
  })

  it('keeps the pages the user had already scrolled through', async () => {
    const { activities, loadMore, reload } = useMixedFeed()
    await loadMore()
    await loadMore()
    await loadMore()
    expect(activities.value).toHaveLength(25)

    await reload()

    expect(activities.value).toHaveLength(25)
  })

  it('reuses the identity of activities that did not change', async () => {
    const { activities, loadMore, reload } = useMixedFeed()
    await loadMore()
    const idsBefore = activities.value.map(a => a.id)

    await reload()

    // Same keys in the same order is what lets Vue reuse the mounted cards.
    expect(activities.value.map(a => a.id)).toEqual(idsBefore)
  })

  it('picks up new activities and refreshes the counts', async () => {
    const { activities, counts, loadMore, reload } = useMixedFeed()
    await loadMore()
    expect(counts.value.total).toBe(25)

    stored = [makeActivity(99), ...stored]
    await reload()

    expect(activities.value[0].id).toBe('act-99')
    expect(counts.value.total).toBe(26)
  })

  it('continues paginating correctly after a refresh', async () => {
    const { activities, loadMore, reload, hasMore } = useMixedFeed()
    await loadMore()
    await reload()

    await loadMore()

    expect(activities.value).toHaveLength(20)
    expect(hasMore.value).toBe(true)

    await loadMore()
    expect(activities.value).toHaveLength(25)
    expect(hasMore.value).toBe(false)
  })
})
