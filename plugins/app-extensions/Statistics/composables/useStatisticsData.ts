import { ref, computed, onUnmounted } from 'vue'
import type { Activity } from '@/types/activity'
import { getPluginContext } from '@/services/PluginContextFactory'
import type { IActivityService } from '@/types/plugin-context'
import { formatSportType } from '@/utils/sportLabels'
import { mainSport } from '../dashboardData'

const allActivities = ref<Activity[]>([])
const selectedSport = ref<string>('')
const loading = ref(false)
/**
 * Whether the reader picked a sport themselves. Until they do, the page opens
 * on the sport they practise most: pace, records and a distance total only
 * mean something for one sport at a time. "All sports" stays one choice away,
 * and once chosen it stays chosen.
 */
let sportChosen = false
let initialized = false
let activityService: IActivityService | null = null

const filteredActivities = computed(() => {
  if (!selectedSport.value) return allActivities.value
  return allActivities.value.filter(
    a => a.type?.toLowerCase() === selectedSport.value.toLowerCase()
  )
})

const sportTypes = computed(() => {
  const types = new Set<string>()
  for (const a of allActivities.value) {
    if (a.type) types.add(a.type.toLowerCase())
  }
  return Array.from(types).sort()
})

const sportOptions = computed(() => {
  return sportTypes.value.map(s => ({
    value: s,
    label: formatSportType(s)
  }))
})

async function loadActivities() {
  loading.value = true
  try {
    if (!activityService) {
      const ctx = await getPluginContext()
      activityService = ctx.activity
    }
    allActivities.value = await activityService.getAllActivities()
    if (!sportChosen && !selectedSport.value) selectedSport.value = mainSport(allActivities.value)
  } finally {
    loading.value = false
  }
}

function handleActivityChanged() {
  loadActivities()
}

async function init() {
  if (initialized) return
  initialized = true
  await loadActivities()
  // Listen for activity changes via global events (no direct emitter access needed)
  window.addEventListener('openstride:activities-refreshed', handleActivityChanged)
}

function cleanup() {
  window.removeEventListener('openstride:activities-refreshed', handleActivityChanged)
  initialized = false
  activityService = null
}

/** The reader's own choice, which the default never overrides again. */
function chooseSport(sport: string) {
  sportChosen = true
  selectedSport.value = sport
}

export function useStatisticsData() {
  init()

  onUnmounted(() => {
    cleanup()
  })

  return {
    allActivities,
    filteredActivities,
    selectedSport,
    chooseSport,
    sportTypes,
    sportOptions,
    loading
  }
}
