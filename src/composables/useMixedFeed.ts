import { ref, computed } from 'vue'
import { ActivityFeedService, type FeedActivity } from '@/services/ActivityFeedService'

// Re-export FeedActivity type for convenience
export type { FeedActivity }

/**
 * Composable for managing mixed activity feed state
 * Handles pagination, loading states, and UI interactions
 * Delegates data loading and transformation to ActivityFeedService
 */
export function useMixedFeed() {
  // State
  const activities = ref<FeedActivity[]>([])
  const loading = ref(false)
  const hasMore = ref(true)
  const page = ref(0)
  const pageSize = 10

  // Cached data and concurrency control. Reactive so `counts` recomputes once a
  // refresh brings in new data.
  const allActivities = ref<FeedActivity[]>([])
  let loadMorePromise: Promise<void> | null = null

  // Service dependency
  const feedService = ActivityFeedService.getInstance()

  /**
   * Load all activities from service
   */
  const loadAllActivities = async (): Promise<FeedActivity[]> => {
    allActivities.value = await feedService.loadAllActivities()
    return allActivities.value
  }

  /**
   * Load next page of activities
   */
  const loadMore = async () => {
    // If already loading, wait for existing operation to complete
    if (loadMorePromise) {
      return loadMorePromise
    }

    // Early return if no more data
    if (!hasMore.value) return

    const run = async () => {
      loading.value = true

      try {
        // Load all activities if not loaded yet
        if (allActivities.value.length === 0) {
          await loadAllActivities()
        }

        // Calculate pagination
        const start = page.value * pageSize
        const end = start + pageSize
        const newActivities = allActivities.value.slice(start, end)

        if (newActivities.length < pageSize) {
          hasMore.value = false
        }

        activities.value.push(...newActivities)
        page.value += 1
      } catch (error) {
        console.error('[useMixedFeed] Error loading activities:', error)
      } finally {
        loading.value = false
      }
    }

    // The guard must be cleared in a `.finally()` callback, which always runs as
    // a microtask — i.e. after the assignment below. Clearing it inside the body
    // instead only works while the body suspends: once the cache is warm it runs
    // straight through, the assignment lands afterwards, and the stale promise
    // blocks every later page.
    loadMorePromise = run().finally(() => {
      loadMorePromise = null
    })

    return loadMorePromise
  }

  /**
   * Refresh the feed in place.
   *
   * Emptying `activities` first would unmount every card between the two
   * renders, and each card owns a Leaflet map that refetches its OSM tiles when
   * it mounts. Fetching first and assigning once lets the keyed diff reuse the
   * existing cards, so the maps are never torn down. It also keeps however many
   * pages the user had already scrolled through.
   */
  const reload = async () => {
    // Wait for any ongoing load to complete
    if (loadMorePromise) {
      await loadMorePromise
    }

    const visible = Math.max(activities.value.length, pageSize)
    await loadAllActivities()

    activities.value = allActivities.value.slice(0, visible)
    page.value = Math.ceil(activities.value.length / pageSize)
    hasMore.value = activities.value.length < allActivities.value.length
  }

  /**
   * Get count of activities by source
   */
  const counts = computed(() => {
    return feedService.getActivityCounts(allActivities.value)
  })

  return {
    activities,
    loading,
    hasMore,
    loadMore,
    reload,
    counts
  }
}
