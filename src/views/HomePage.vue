<template>
  <div class="home-page">
    <!-- Blocks that ask for an action rather than report a figure -->
    <div v-if="topSlotComponents.length" class="home-top">
      <component v-for="(comp, i) in topSlotComponents" :is="comp" :key="`home-top-${i}`" />
    </div>

    <!-- Android only, and only once the app has proven useful -->
    <InstallPrompt variant="banner" />

    <div class="home-controls">
      <ActivitySearchBar
        :model-value="filters.text || ''"
        :filters-open="filtersOpen"
        :has-active-filters="hasActiveFilters"
        :active-filter-count="activeFilterCount"
        data-test="search-bar"
        @update:model-value="setTextFilter"
        @toggle-filters="toggleFiltersPanel"
      />

      <!-- Nothing to choose between until someone is followed -->
      <div v-if="counts.friends > 0" class="scope-tabs" role="tablist" data-test="scope-tabs">
        <button
          v-for="option in SCOPES"
          :key="option"
          class="scope-tab"
          :class="{ 'is-active': scope === option }"
          role="tab"
          :aria-selected="scope === option"
          :data-test="`scope-${option}`"
          @click="scope = option"
        >
          {{ t(`feed.scopes.${option}`) }}
        </button>
      </div>

      <Transition name="slide">
        <ActivityFiltersPanel
          v-if="filtersOpen"
          :model-value="filters"
          :has-active-filters="hasActiveFilters"
          :available-sports="facets.sports"
          :has-distance="facets.hasDistance"
          @update:model-value="onFiltersChange"
          @reset="resetFilters"
        />
      </Transition>

      <p v-if="hasActiveFilters && !loading" class="result-count" data-test="result-count">
        {{ t('filters.resultCount', { count: totalCount }) }}
      </p>
    </div>

    <!-- Activities Feed -->
    <div ref="scrollArea" class="feed-container">
      <ActivityCard
        v-for="activity in activities"
        :key="activity.id"
        :activity="activity"
        :friend-username="activity.source === 'friend' ? activity.friendUsername : undefined"
        data-test="activity-card"
      />

      <p v-if="loading" class="loading-text" data-test="loading-message">
        {{ t('activities.loading') }}
      </p>

      <!-- Nothing to show splits in two: filters that match nothing, and a
           library that is genuinely empty. The second is the first screen a new
           account ever sees, so it points at the way out instead of announcing
           that the empty list finished loading. -->
      <p v-if="isEmpty && hasActiveFilters" class="end-text" data-test="no-results-message">
        {{ t('filters.noResults') }}
      </p>
      <ActivityEmptyState
        v-else-if="isEmpty"
        :title="t('activities.noActivity')"
        :description="t('activities.noActivityDescription')"
        show-friends
      />
      <p v-else-if="!hasMore && !loading" class="end-text" data-test="all-loaded-message">
        {{ t('activities.allLoaded') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ActivityCard from '@/components/ActivityCard.vue'
import ActivityEmptyState from '@/components/ActivityEmptyState.vue'
import ActivitySearchBar from '@/components/ActivitySearchBar.vue'
import ActivityFiltersPanel from '@/components/ActivityFilters.vue'
import InstallPrompt from '@/components/InstallPrompt.vue'
import { useMixedFeed, type FeedScope } from '@/composables/useMixedFeed'
import { useActivityFilters } from '@/composables/useActivityFilters'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useFeedMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { getActivityService, type ActivityServiceEvent } from '@/services/ActivityService'
import type { ActivityFilters } from '@/types/activity'
import { debounce } from '@/utils/debounce'

const SCOPES: FeedScope[] = ['all', 'own', 'friends']

const { t } = useI18n()

const { components: topRaw } = useSlotExtensions('home.top')
const topSlotComponents = computed(() => topRaw.value)

const {
  filters,
  scope,
  filtersOpen,
  hasActiveFilters,
  activeFilterCount,
  serviceFilters,
  resetFilters,
  setTextFilter,
  toggleFiltersPanel
} = useActivityFilters()

const { activities, loading, hasMore, loadMore, reload, counts, facets, totalCount } = useMixedFeed(
  {
    filters: serviceFilters,
    scope
  }
)

// Lifts calories, climb and the rest out of the details of the page on screen,
// so the cards can show what only the details hold.
useFeedMetricsIndex(activities)

const scrollArea = ref<HTMLElement | null>(null)

// Nothing left to fetch and nothing fetched: the list is settled on empty,
// rather than merely between two pages.
const isEmpty = computed(() => !loading.value && !hasMore.value && activities.value.length === 0)

// A single refresh is answered by every service that listens, so the events
// arrive in a burst — reload once for the whole burst.
const onRefresh = debounce(() => {
  reload()
}, 500)

const handleActivityChanged = (event: Event) => {
  const { type } = (event as CustomEvent<ActivityServiceEvent>).detail
  if (type === 'saved' || type === 'deleted') onRefresh()
}

let activityService: Awaited<ReturnType<typeof getActivityService>> | null = null

onMounted(async () => {
  loadMore()
  window.addEventListener('scroll', handleScroll)
  window.addEventListener('openstride:activities-refreshed', onRefresh)

  activityService = await getActivityService()
  activityService.emitter.addEventListener('activity-changed', handleActivityChanged)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('openstride:activities-refreshed', onRefresh)
  activityService?.emitter.removeEventListener('activity-changed', handleActivityChanged)
})

const handleScroll = () => {
  const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100
  if (bottom) {
    loadMore()
  }
}

function onFiltersChange(newFilters: ActivityFilters) {
  filters.value = newFilters
}
</script>

<style scoped>
.home-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 0;
}

.home-top {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
}

/* One rhythm for the whole column: the search row, the scope tabs and the
   filter panel are spaced like the cards are spaced between themselves */
.home-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.scope-tabs {
  display: flex;
  gap: 0.25rem;
  background: var(--color-gray-100);
  border-radius: 8px;
  padding: 0.2rem;
}

.scope-tab {
  flex: 1;
  padding: 0.45rem 0.6rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-gray-500);
  font-family: var(--font-main);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.scope-tab.is-active {
  background: var(--color-white);
  color: var(--color-gray-900);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.result-count {
  font-size: 0.85rem;
  color: var(--color-gray-500);
  margin: 0;
}

.feed-container {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.loading-text,
.end-text {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--color-gray-500);
  font-size: 0.875rem;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 500px;
}

@media (max-width: 640px) {
  .home-page {
    padding: 0;
  }

  .home-top,
  .home-controls {
    margin-bottom: 0.75rem;
  }
}
</style>
