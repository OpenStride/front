import { ref, computed, watch, type Ref } from 'vue'
import { ActivityFeedService, type FeedActivity } from '@/services/ActivityFeedService'
import { applyActivityFilters, filterFacets } from '@/utils/activityFilters'
import type { ActivityFilters } from '@/types/activity'

// Re-export FeedActivity type for convenience
export type { FeedActivity }

/** Whose activities the list is showing. */
export type FeedScope = 'all' | 'own' | 'friends'

interface FeedOptions {
  filters?: Ref<ActivityFilters | undefined>
  scope?: Ref<FeedScope>
}

const PAGE_SIZE = 10

/**
 * The one activity list.
 *
 * The app used to have two: a feed on `/` and a searchable list on
 * `/my-activities`, showing the same cards in the same order for anyone
 * without friends — which is most people, since following someone means
 * scanning their QR code. Two views meant two loading paths, two scroll
 * handlers and two refresh strategies for one screen.
 *
 * The whole corpus is read once and kept in memory; scope, filters and paging
 * are derived from it. That is what lets a page turn cost nothing, and what
 * keeps the mounted cards — and the Leaflet map each one owns — alive across
 * a refresh: the rendered list is a slice of a stable array, so the keyed diff
 * reuses them instead of tearing down every tile.
 */
export function useMixedFeed(options: FeedOptions = {}) {
  const { filters, scope } = options

  const all = ref<FeedActivity[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  /** How many of the matching activities are on screen */
  const shown = ref(PAGE_SIZE)

  const feedService = ActivityFeedService.getInstance()

  const inScope = computed(() => {
    switch (scope?.value) {
      case 'own':
        return all.value.filter(a => a.source === 'own')
      case 'friends':
        return all.value.filter(a => a.source === 'friend')
      default:
        return all.value
    }
  })

  const matching = computed(() => applyActivityFilters(inScope.value, filters?.value))

  const activities = computed(() => matching.value.slice(0, shown.value))
  const hasMore = computed(() => shown.value < matching.value.length)
  /** Everything the current filters match, not just what is on screen */
  const totalCount = computed(() => matching.value.length)

  const counts = computed(() => feedService.getActivityCounts(all.value))

  // The panel offers what the list can actually narrow, so it follows the
  // scope: browsing a friend's swims should not offer a distance range the
  // corpus on screen has no answer for.
  const facets = computed(() => filterFacets(inScope.value))

  const fetchAll = async () => {
    loading.value = true
    try {
      all.value = await feedService.loadAllActivities()
      loaded.value = true
    } catch (error) {
      console.error('[useMixedFeed] Error loading activities:', error)
    } finally {
      loading.value = false
    }
  }

  /** Show one more page, reading the corpus in on the first call. */
  const loadMore = async () => {
    if (!loaded.value) {
      if (loading.value) return
      await fetchAll()
      return
    }
    if (!hasMore.value) return
    shown.value += PAGE_SIZE
  }

  /**
   * Re-read the corpus, keeping however many pages were scrolled through.
   *
   * `shown` is left alone on purpose: it counts positions, not identities, so
   * the same stretch of the list stays on screen.
   */
  const reload = async () => {
    await fetchAll()
  }

  // A narrower question deserves a fresh first page rather than the scroll
  // depth of the previous one.
  watch([() => filters?.value, () => scope?.value], () => {
    shown.value = PAGE_SIZE
  })

  return {
    activities,
    loading,
    hasMore,
    loadMore,
    reload,
    counts,
    facets,
    totalCount
  }
}
