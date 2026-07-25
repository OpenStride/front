import { ref, computed, onUnmounted } from 'vue'
import type { Activity, ActivityDetails } from '@/types/activity'
import { getPluginContext } from '@/services/PluginContextFactory'
import { formatSportType } from '@/utils/sportLabels'
import type { StatsMap } from '../types'

const activities = ref<Activity[]>([])
const stats = ref<StatsMap>(new Map())
const loading = ref(false)
const statsLoading = ref(false)

let initialized = false
let statsLoaded = false
let statsRequest: Promise<void> | null = null

const sportOptions = computed(() => {
  const types = new Set<string>()
  for (const a of activities.value) {
    if (a.type) types.add(a.type.toLowerCase())
  }
  return Array.from(types)
    .sort()
    .map(value => ({ value, label: formatSportType(value) }))
})

async function loadActivities() {
  loading.value = true
  try {
    const ctx = await getPluginContext()
    activities.value = await ctx.activity.getAllActivities()
  } finally {
    loading.value = false
  }
}

/**
 * Load the per-activity stats once, keeping only the scalars.
 *
 * activity_details carries every sample, so this reads the whole store — but
 * the samples are dropped immediately and the extracted map stays small enough
 * to serve every metric and granularity without another read.
 */
async function ensureStats(): Promise<void> {
  if (statsLoaded) return
  if (statsRequest) return statsRequest

  statsRequest = (async () => {
    statsLoading.value = true
    try {
      const ctx = await getPluginContext()
      const allDetails = (await ctx.storage.exportDB('activity_details')) as ActivityDetails[]
      const map: StatsMap = new Map()
      for (const details of allDetails) {
        if (details?.id && details.stats) map.set(details.id, { ...details.stats })
      }
      stats.value = map
      statsLoaded = true
    } finally {
      statsLoading.value = false
      statsRequest = null
    }
  })()

  return statsRequest
}

function handleActivitiesRefreshed() {
  statsLoaded = false
  stats.value = new Map()
  loadActivities()
}

function init() {
  if (initialized) return
  initialized = true
  loadActivities()
  window.addEventListener('openstride:activities-refreshed', handleActivitiesRefreshed)
}

function cleanup() {
  window.removeEventListener('openstride:activities-refreshed', handleActivitiesRefreshed)
  initialized = false
  statsLoaded = false
}

export function useMetricActivities() {
  init()

  onUnmounted(cleanup)

  return {
    activities,
    stats,
    sportOptions,
    loading,
    statsLoading,
    ensureStats
  }
}
