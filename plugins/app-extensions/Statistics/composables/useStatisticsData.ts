import { ref, computed, onUnmounted } from 'vue'
import type { Activity } from '@/types/activity'
import { getActivityService } from '@/services/ActivityService'
import { formatSportType } from '@plugins/app-extensions/Goals/sportLabels'

const allActivities = ref<Activity[]>([])
const selectedSport = ref<string>('')
const loading = ref(false)
let initialized = false
let activityService: Awaited<ReturnType<typeof getActivityService>> | null = null

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
      activityService = await getActivityService()
    }
    allActivities.value = await activityService.getAllActivities()
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
  if (activityService) {
    activityService.emitter.addEventListener('activity-changed', handleActivityChanged)
  }
  window.addEventListener('openstride:activities-refreshed', handleActivityChanged)
}

function cleanup() {
  if (activityService) {
    activityService.emitter.removeEventListener('activity-changed', handleActivityChanged)
  }
  window.removeEventListener('openstride:activities-refreshed', handleActivityChanged)
  initialized = false
  activityService = null
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
    sportTypes,
    sportOptions,
    loading
  }
}
