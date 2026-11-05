import { ref, computed, onUnmounted } from 'vue'
import type { Activity } from '@/types/activity'
import { getPluginContext } from '@/services/PluginContextFactory'
import type { IActivityService } from '@/types/plugin-context'
import { formatSportType } from '@/utils/sportLabels'
import { canonicalSport, matchesSportScope, sportScopes } from '@/types/sport'
import { mainSport } from '../dashboardData'

const allActivities = ref<Activity[]>([])
const selectedSport = ref<string>('')
const loading = ref(false)
/**
 * The reader's last choice, kept in the settings so the page reopens where
 * they left it — on this device and their others. Until they pick one, the
 * page opens on the sport they practise most: pace, records and a distance
 * total only mean something for one sport at a time. An empty string is a
 * choice too: "all sports".
 */
const SPORT_SETTING = 'statistics_selected_sport'
let savedSport: string | null = null
let savedLoaded = false
let initialized = false
let activityService: IActivityService | null = null

const filteredActivities = computed(() => {
  if (!selectedSport.value) return allActivities.value
  return allActivities.value.filter(a => matchesSportScope(selectedSport.value, a.type))
})

/** The menu's choices: running gathers road, treadmill and trail (see `sportScopes`). */
const sportTypes = computed(() => sportScopes(allActivities.value.map(a => a.type)))

const sportOptions = computed(() => {
  return sportTypes.value.map(s => ({
    value: s,
    label: formatSportType(s)
  }))
})

function ctx() {
  return getPluginContext()
}

/**
 * The saved choice while it still names a sport the reader has (a sport whose
 * activities were all deleted would open an empty page), else the main sport.
 */
function initialSport(): string {
  if (savedSport !== null && (savedSport === '' || sportTypes.value.includes(savedSport))) {
    return savedSport
  }
  return mainSport(allActivities.value)
}

async function loadActivities() {
  loading.value = true
  try {
    if (!activityService) activityService = (await ctx()).activity
    if (!savedLoaded) {
      savedLoaded = true
      const saved = await ctx()
        .then(c => c.storage.getData(SPORT_SETTING))
        .catch(() => null)
      if (saved && typeof (saved as { sport?: unknown }).sport === 'string') {
        // Canonical, so a choice saved before the vocabulary settled still matches.
        savedSport = canonicalSport((saved as { sport: string }).sport)
      }
    }
    allActivities.value = await activityService.getAllActivities()
    selectedSport.value = initialSport()
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

/** The reader's own choice: shown at once, and remembered for next time. */
function chooseSport(sport: string) {
  savedSport = sport
  selectedSport.value = sport
  void ctx()
    .then(c => c.storage.saveData(SPORT_SETTING, { sport }))
    .catch(() => {
      // Only the memory of the choice is lost; the page already shows it.
    })
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
