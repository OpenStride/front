import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { getDayKey, fromDayKey } from '@/utils/dateKeys'
import type { FeedScope } from '@/composables/useMixedFeed'
import type { ActivityFilters } from '@/types/activity'

const DEFAULT_FILTERS: ActivityFilters = {
  text: '',
  sportType: '',
  distanceMin: undefined,
  distanceMax: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  durationMin: undefined,
  durationMax: undefined
}

/**
 * The query parameter each filter travels under.
 *
 * Short names because they end up in a shared link, and SI values because the
 * link has to survive the reader's unit preference — a URL carrying "5" would
 * mean five kilometres to one person and five miles to the next. Dates are the
 * exception: `YYYY-MM-DD` is both stable and legible, which a millisecond
 * count is not.
 */
const QUERY_KEYS = {
  scope: 'who',
  text: 'q',
  sportType: 'sport',
  distanceMin: 'distMin',
  distanceMax: 'distMax',
  dateFrom: 'from',
  dateTo: 'to',
  durationMin: 'durMin',
  durationMax: 'durMax'
} as const

function readNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Rebuild the filter state a link was carrying. */
export function filtersFromQuery(query: LocationQuery): ActivityFilters {
  return {
    ...DEFAULT_FILTERS,
    text: readString(query[QUERY_KEYS.text]),
    sportType: readString(query[QUERY_KEYS.sportType]),
    distanceMin: readNumber(query[QUERY_KEYS.distanceMin]),
    distanceMax: readNumber(query[QUERY_KEYS.distanceMax]),
    dateFrom: fromDayKey(readString(query[QUERY_KEYS.dateFrom]), 'start'),
    dateTo: fromDayKey(readString(query[QUERY_KEYS.dateTo]), 'end'),
    durationMin: readNumber(query[QUERY_KEYS.durationMin]),
    durationMax: readNumber(query[QUERY_KEYS.durationMax])
  }
}

/** Only what is actually set, so an unfiltered list keeps a clean URL. */
export function filtersToQuery(filters: ActivityFilters): LocationQueryRaw {
  const query: LocationQueryRaw = {}

  if (filters.text) query[QUERY_KEYS.text] = filters.text
  if (filters.sportType) query[QUERY_KEYS.sportType] = filters.sportType
  if (filters.distanceMin != null) query[QUERY_KEYS.distanceMin] = String(filters.distanceMin)
  if (filters.distanceMax != null) query[QUERY_KEYS.distanceMax] = String(filters.distanceMax)
  if (filters.dateFrom != null) query[QUERY_KEYS.dateFrom] = getDayKey(new Date(filters.dateFrom))
  if (filters.dateTo != null) query[QUERY_KEYS.dateTo] = getDayKey(new Date(filters.dateTo))
  if (filters.durationMin != null) query[QUERY_KEYS.durationMin] = String(filters.durationMin)
  if (filters.durationMax != null) query[QUERY_KEYS.durationMax] = String(filters.durationMax)

  return query
}

/**
 * Whose activities to show.
 *
 * Deliberately not a field of `ActivityFilters`: every field there is readable
 * off an `Activity`, which is what keeps the filters usable against the local
 * store. Ownership is not — only the merged feed knows where a card came
 * from — so it travels beside them rather than inside them.
 */
export function scopeFromQuery(query: LocationQuery): FeedScope {
  const value = readString(query[QUERY_KEYS.scope])
  return value === 'own' || value === 'friends' ? value : 'all'
}

export function useActivityFilters() {
  const route = useRoute()
  const router = useRouter()

  // A filtered view used to live and die with the component: opening an
  // activity and coming back reset it, and it could not be shared or
  // bookmarked. Reading the URL first makes the link the source of truth.
  const filters = ref<ActivityFilters>(filtersFromQuery(route.query))
  const scope = ref<FeedScope>(scopeFromQuery(route.query))
  const filtersOpen = ref(false)

  const hasActiveFilters = computed(() => {
    const f = filters.value
    return !!(
      f.text ||
      f.sportType ||
      f.distanceMin != null ||
      f.distanceMax != null ||
      f.dateFrom != null ||
      f.dateTo != null ||
      f.durationMin != null ||
      f.durationMax != null
    )
  })

  // Each range counts once: the badge reports how many questions are being
  // asked, not how many boxes hold a number.
  const activeFilterCount = computed(() => {
    const f = filters.value
    let count = 0
    if (f.text) count++
    if (f.sportType) count++
    if (f.distanceMin != null || f.distanceMax != null) count++
    if (f.dateFrom != null || f.dateTo != null) count++
    if (f.durationMin != null || f.durationMax != null) count++
    return count
  })

  /** Returns a clean filters object (only non-empty values) for passing to service */
  const serviceFilters = computed<ActivityFilters | undefined>(() => {
    if (!hasActiveFilters.value) return undefined
    const f = filters.value
    const result: ActivityFilters = {}
    if (f.text) result.text = f.text
    if (f.sportType) result.sportType = f.sportType
    if (f.distanceMin != null) result.distanceMin = f.distanceMin
    if (f.distanceMax != null) result.distanceMax = f.distanceMax
    if (f.dateFrom != null) result.dateFrom = f.dateFrom
    if (f.dateTo != null) result.dateTo = f.dateTo
    if (f.durationMin != null) result.durationMin = f.durationMin
    if (f.durationMax != null) result.durationMax = f.durationMax
    return result
  })

  // `replace`, not `push`: narrowing a list is not a step the back button
  // should have to walk through one keystroke at a time.
  watch(
    () => {
      const query = filtersToQuery(filters.value)
      if (scope.value !== 'all') query[QUERY_KEYS.scope] = scope.value
      return query
    },
    query => {
      if (JSON.stringify(query) === JSON.stringify(route.query)) return
      void router.replace({ query }).catch(() => {
        // A navigation cancelled by a faster one leaves the next write to win
      })
    },
    { deep: true }
  )

  // The scope is not reset with the rest: "show me my own outings" is a place
  // the reader chose to be, not a filter they applied to it.
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

  return {
    filters,
    scope,
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
