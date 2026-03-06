import { ref, computed } from 'vue'
import type { ActivityFilters } from '@/types/activity'

const DEFAULT_FILTERS: ActivityFilters = {
  text: '',
  sportType: '',
  distanceMin: undefined,
  distanceMax: undefined,
  ascentMin: undefined,
  ascentMax: undefined
}

export function useActivityFilters() {
  const filters = ref<ActivityFilters>({ ...DEFAULT_FILTERS })
  const filtersOpen = ref(false)

  const hasActiveFilters = computed(() => {
    const f = filters.value
    return !!(
      f.text ||
      f.sportType ||
      f.distanceMin != null ||
      f.distanceMax != null ||
      f.ascentMin != null ||
      f.ascentMax != null
    )
  })

  const activeFilterCount = computed(() => {
    const f = filters.value
    let count = 0
    if (f.text) count++
    if (f.sportType) count++
    if (f.distanceMin != null || f.distanceMax != null) count++
    if (f.ascentMin != null || f.ascentMax != null) count++
    return count
  })

  function resetFilters() {
    filters.value = { ...DEFAULT_FILTERS }
  }

  function setTextFilter(text: string) {
    filters.value = { ...filters.value, text }
  }

  function setSportType(sportType: string) {
    filters.value = { ...filters.value, sportType }
  }

  function toggleFiltersPanel() {
    filtersOpen.value = !filtersOpen.value
  }

  /** Returns a clean filters object (only non-empty values) for passing to service */
  const serviceFilters = computed<ActivityFilters | undefined>(() => {
    if (!hasActiveFilters.value) return undefined
    const f = filters.value
    const result: ActivityFilters = {}
    if (f.text) result.text = f.text
    if (f.sportType) result.sportType = f.sportType
    if (f.distanceMin != null) result.distanceMin = f.distanceMin
    if (f.distanceMax != null) result.distanceMax = f.distanceMax
    if (f.ascentMin != null) result.ascentMin = f.ascentMin
    if (f.ascentMax != null) result.ascentMax = f.ascentMax
    return result
  })

  return {
    filters,
    filtersOpen,
    hasActiveFilters,
    activeFilterCount,
    serviceFilters,
    resetFilters,
    setTextFilter,
    setSportType,
    toggleFiltersPanel
  }
}
