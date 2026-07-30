<template>
  <div class="my-activities">
    <div class="activities-top-container">
      <component v-for="(comp, i) in topSlotComponents" :is="comp" :key="`myacts-top-${i}`" />
    </div>

    <ActivitySearchBar
      :model-value="filters.text || ''"
      :filters-open="filtersOpen"
      :has-active-filters="hasActiveFilters"
      :active-filter-count="activeFilterCount"
      data-test="search-bar"
      @update:model-value="setTextFilter"
      @toggle-filters="toggleFiltersPanel"
    />

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

    <div ref="scrollArea" class="scroll-container">
      <ActivityCard
        v-for="activity in activities"
        :key="activity.id"
        :activity="activity"
        data-test="activity-card"
      />
      <p v-if="loading" data-test="loading-message">{{ t('activities.loading') }}</p>

      <!-- Nothing to show splits in two: filters that match nothing, and a
           library that is genuinely empty. The second is the first screen after
           onboarding, so it points at the way out instead of announcing that
           the empty list finished loading. -->
      <p v-if="isEmpty && hasActiveFilters" data-test="no-results-message">
        {{ t('filters.noResults') }}
      </p>
      <ActivityEmptyState
        v-else-if="isEmpty"
        :title="t('activities.noOwnActivity')"
        :description="t('activities.noOwnActivityDescription')"
      />
      <p v-else-if="!hasMore && !loading" data-test="all-loaded-message">
        {{ t('activities.allLoaded') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ActivityCard from '@/components/ActivityCard.vue'
import ActivityEmptyState from '@/components/ActivityEmptyState.vue'
import ActivitySearchBar from '@/components/ActivitySearchBar.vue'
import ActivityFiltersPanel from '@/components/ActivityFilters.vue'
import type { Activity, ActivityFilters } from '@/types/activity'
import { getActivityService, type ActivityServiceEvent } from '@/services/ActivityService'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useActivityFilters } from '@/composables/useActivityFilters'
import { useFeedMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { debounce } from '@/utils/debounce'

const { t } = useI18n()

// Allow plugins to inject aggregated overview widgets
const { components: topRaw } = useSlotExtensions('myactivities.top')
const topSlotComponents = computed(() => topRaw.value)

// Filters
const {
  filters,
  filtersOpen,
  hasActiveFilters,
  activeFilterCount,
  serviceFilters,
  resetFilters,
  setTextFilter,
  toggleFiltersPanel
} = useActivityFilters()

const activities = ref<Activity[]>([])
const loading = ref(false)
const page = ref(0)
const pageSize = 10
const hasMore = ref(true)
const totalCount = ref(0)
// What the filter panel is allowed to offer, read from the library itself
const facets = ref<{ sports: string[]; hasDistance: boolean }>({ sports: [], hasDistance: false })

// Nothing left to fetch and nothing fetched: the list is settled on empty,
// rather than merely between two pages.
const isEmpty = computed(() => !loading.value && !hasMore.value && activities.value.length === 0)

// Lifts calories, climb and the rest out of the details of the page on screen,
// so the cards can show what only the details hold.
useFeedMetricsIndex(activities)

// Store ActivityService instance for cleanup
let activityServiceInstance: Awaited<ReturnType<typeof getActivityService>> | null = null

// Debounced reload: batch imports emit per activity, and a single refresh is
// answered by every service that listens, so the events arrive in bursts.
const debouncedSoftReload = debounce(() => softReload(), 500)

// Handle activity-changed events from ActivityService
const handleActivityChanged = (event: Event) => {
  const customEvent = event as CustomEvent<ActivityServiceEvent>
  const { type } = customEvent.detail
  if (type === 'saved') {
    debouncedSoftReload()
  }
}

onMounted(async () => {
  activityServiceInstance = await getActivityService()
  activityServiceInstance.emitter.addEventListener('activity-changed', handleActivityChanged)

  await loadFacets()
  // Through `reloadWithFilters` rather than `loadActivities`, so a link opened
  // with filters already in its query gets its result count on the first frame
  // instead of only after the next keystroke.
  reloadWithFilters()
  window.addEventListener('scroll', handleScroll)
  window.addEventListener('openstride:activities-refreshed', debouncedSoftReload)
})

onBeforeUnmount(() => {
  if (activityServiceInstance) {
    activityServiceInstance.emitter.removeEventListener('activity-changed', handleActivityChanged)
  }
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('openstride:activities-refreshed', debouncedSoftReload)
})

// Reload when filters change
watch(serviceFilters, () => {
  reloadWithFilters()
})

const handleScroll = () => {
  const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100
  if (bottom) loadActivities()
}

const loadActivities = async () => {
  if (loading.value || !hasMore.value) return
  const activityService = await getActivityService()
  loading.value = true

  const newActivities = await activityService.getActivities({
    offset: page.value * pageSize,
    limit: pageSize,
    filters: serviceFilters.value
  })

  if (newActivities.length < pageSize) {
    hasMore.value = false
  }

  activities.value.push(...newActivities)
  page.value += 1
  loading.value = false
}

const reloadWithFilters = async () => {
  activities.value = []
  page.value = 0
  hasMore.value = true
  loading.value = false

  const activityService = await getActivityService()
  totalCount.value = await activityService.countActivities(serviceFilters.value)

  await loadActivities()
}

/**
 * Refresh the list in place.
 *
 * Emptying `activities` first unmounts every card between the two renders, and
 * each card owns a Leaflet map that refetches its OSM tiles on mount. Fetching
 * first and assigning once lets the keyed diff reuse the cards, so the maps
 * survive — and every page the user had scrolled through is kept.
 */
const softReload = async () => {
  const activityService = await getActivityService()
  const visible = Math.max(activities.value.length, pageSize)

  loading.value = true
  try {
    const fresh = await activityService.getActivities({
      offset: 0,
      limit: visible,
      filters: serviceFilters.value
    })
    totalCount.value = await activityService.countActivities(serviceFilters.value)
    await loadFacets()

    activities.value = fresh
    page.value = Math.ceil(fresh.length / pageSize)
    hasMore.value = fresh.length >= visible
  } finally {
    loading.value = false
  }
}

const loadFacets = async () => {
  const activityService = await getActivityService()
  facets.value = await activityService.getFilterFacets()
}

function onFiltersChange(newFilters: ActivityFilters) {
  filters.value = newFilters
}
</script>

<style scoped>
.my-activities {
  max-width: 600px;
  margin: 2rem auto;
  /* One rhythm for the whole column: the search row, the filter panel and the
     list are spaced like the cards are spaced between themselves */
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.my-activities:first-child {
  margin-top: 0;
}
.activities-top-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.result-count {
  font-size: 0.85rem;
  color: var(--color-gray-500);
  margin: 0;
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
</style>
