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
        :available-sports="availableSports"
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
      <p
        v-if="!hasMore && !loading && activities.length === 0 && hasActiveFilters"
        data-test="no-results-message"
      >
        {{ t('filters.noResults') }}
      </p>
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
import ActivitySearchBar from '@/components/ActivitySearchBar.vue'
import ActivityFiltersPanel from '@/components/ActivityFilters.vue'
import type { Activity, ActivityFilters } from '@/types/activity'
import { getActivityService, type ActivityServiceEvent } from '@/services/ActivityService'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useActivityFilters } from '@/composables/useActivityFilters'
import { debounce } from '@/utils/debounce'

const { t } = useI18n()

// Allow plugins to inject aggregated overview widgets
const { components: topRaw } = useSlotExtensions('myactivities.top')
const topSlotComponents = computed(() =>
  topRaw.value.map(c => (c as { default?: unknown }).default || c)
)

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
const availableSports = ref<string[]>([])

// Store ActivityService instance for cleanup
let activityServiceInstance: Awaited<ReturnType<typeof getActivityService>> | null = null

// Debounced reload to avoid multiple refreshes when batch importing activities
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

  await loadAvailableSports()
  loadActivities()
  window.addEventListener('scroll', handleScroll)
  window.addEventListener('openstride:activities-refreshed', softReload)
})

onBeforeUnmount(() => {
  if (activityServiceInstance) {
    activityServiceInstance.emitter.removeEventListener('activity-changed', handleActivityChanged)
  }
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('openstride:activities-refreshed', softReload)
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

const softReload = async () => {
  await getActivityService()
  const prevLength = activities.value.length
  activities.value = []
  page.value = 0
  hasMore.value = true
  loading.value = false
  await loadAvailableSports()
  await loadActivities()
  if (prevLength > pageSize) await loadActivities()
}

const loadAvailableSports = async () => {
  const activityService = await getActivityService()
  const all = await activityService.getAllActivities()
  const sports = new Set(all.map(a => a.type?.toLowerCase()).filter(Boolean))
  availableSports.value = [...sports] as string[]
}

function onFiltersChange(newFilters: ActivityFilters) {
  filters.value = newFilters
}
</script>

<style scoped>
.my-activities {
  max-width: 600px;
  margin: 2rem auto;
}
.my-activities:first-child {
  margin-top: 0;
}
.activities-top-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.result-count {
  font-size: 0.85rem;
  color: var(--color-gray-500);
  margin: 0.75rem 0 0.25rem;
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
  margin-top: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 500px;
  margin-top: 0.75rem;
}
</style>
