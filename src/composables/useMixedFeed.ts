import { ref, computed } from 'vue';
import { ActivityFeedService, type FeedActivity } from '@/services/ActivityFeedService';

// Re-export FeedActivity type for convenience
export type { FeedActivity };

/**
 * Composable for managing mixed activity feed state
 * Handles pagination, loading states, and UI interactions
 * Delegates data loading and transformation to ActivityFeedService
 */
export function useMixedFeed() {
  // State
  const activities = ref<FeedActivity[]>([]);
  const loading = ref(false);
  const hasMore = ref(true);
  const page = ref(0);
  const pageSize = 10;

  // Cached data and concurrency control
  let allActivities: FeedActivity[] = [];
  let loadMorePromise: Promise<void> | null = null;

  // Service dependency
  const feedService = ActivityFeedService.getInstance();

  /**
   * Load all activities from service
   */
  const loadAllActivities = async (): Promise<FeedActivity[]> => {
    allActivities = await feedService.loadAllActivities();
    return allActivities;
  };

  /**
   * Load next page of activities
   */
  const loadMore = async () => {
    // If already loading, wait for existing operation to complete
    if (loadMorePromise) {
      return loadMorePromise;
    }

    // Early return if no more data
    if (!hasMore.value) return;

    // Create and store the loading promise
    loadMorePromise = (async () => {
      loading.value = true;

      try {
        // Load all activities if not loaded yet
        if (allActivities.length === 0) {
          await loadAllActivities();
        }

        // Calculate pagination
        const start = page.value * pageSize;
        const end = start + pageSize;
        const newActivities = allActivities.slice(start, end);

        if (newActivities.length < pageSize) {
          hasMore.value = false;
        }

        activities.value.push(...newActivities);
        page.value += 1;
      } catch (error) {
        console.error('[useMixedFeed] Error loading activities:', error);
      } finally {
        loading.value = false;
        loadMorePromise = null;
      }
    })();

    return loadMorePromise;
  };

  /**
   * Reload feed from scratch (e.g., after refresh)
   */
  const reload = async () => {
    // Wait for any ongoing load to complete
    if (loadMorePromise) {
      await loadMorePromise;
    }

    activities.value = [];
    allActivities = [];
    page.value = 0;
    hasMore.value = true;
    loadMorePromise = null;

    await loadMore();
  };

  /**
   * Get count of activities by source
   */
  const counts = computed(() => {
    return feedService.getActivityCounts(allActivities);
  });

  return {
    activities,
    loading,
    hasMore,
    loadMore,
    reload,
    counts
  };
}
