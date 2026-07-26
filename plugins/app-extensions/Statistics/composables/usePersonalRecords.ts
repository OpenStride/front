import { ref, watch, type Ref } from 'vue'
import type { Activity } from '@/types/activity'
import { getPluginContext } from '@/services/PluginContextFactory'
import { inRange } from '@/utils/timeRange'
import {
  useActivityMetricsIndex,
  DISTANCE_TARGETS,
  timeMetricId
} from '@/composables/useActivityMetricsIndex'
import { getRecordPeriodRange, type PersonalRecord, type RecordPeriod } from '../types'

/** Distances shown in the records table, a subset of what the index computes */
const PR_TARGETS = [1_000, 2_000, 5_000, 10_000, 15_000, 20_000, 21_097, 42_195]

const PR_LABELS: Record<number, string> = {
  1000: '1K',
  2000: '2K',
  5000: '5K',
  10000: '10K',
  15000: '15K',
  20000: '20K',
  21097: 'Semi',
  42195: 'Marathon'
}

/**
 * Records used to keep their own cache under `statistics_pr_cache_<sport>`,
 * which lives in `settings` and therefore travelled to the user's storage
 * provider on every recompute. The index replaces it and never leaves the
 * device, so the old entries are dropped once.
 */
const LEGACY_CACHE_PREFIX = 'statistics_pr_cache_'
let legacyCacheCleared = false

async function dropLegacyCache(sports: string[]): Promise<void> {
  if (legacyCacheCleared) return
  legacyCacheCleared = true

  const ctx = await getPluginContext()
  const keys = ['all', ...sports].map(sport => `${LEGACY_CACHE_PREFIX}${sport}`)
  for (const key of keys) {
    try {
      if (await ctx.storage.getData(key)) await ctx.storage.deleteData(key)
    } catch {
      // A key that is not there is the desired state anyway
    }
  }
}

export function usePersonalRecords(
  activities: Ref<Activity[]>,
  selectedSport: Ref<string>,
  selectedPeriod: Ref<RecordPeriod>
) {
  const records = ref<PersonalRecord[]>([])
  const { derived, indexing, progress, ensureIndex } = useActivityMetricsIndex()

  /**
   * A record is the fastest time the index holds for a distance, over the
   * activities of the period. No sample is read here: the scan happened once,
   * when the index was built.
   */
  function collect(acts: Activity[]): PersonalRecord[] {
    const best = new Map<number, PersonalRecord>()

    for (const activity of acts) {
      const values = derived.value.get(activity.id)
      if (!values) continue

      for (const target of PR_TARGETS) {
        const duration = values[timeMetricId(target)]
        if (typeof duration !== 'number' || duration <= 0) continue

        const existing = best.get(target)
        if (existing && existing.duration <= duration) continue

        best.set(target, {
          distance: target,
          distanceLabel: PR_LABELS[target],
          duration,
          pace: duration / (target / 1000) / 60,
          speed: target / 1000 / (duration / 3600),
          date: activity.startTime,
          activityId: activity.id
        })
      }
    }

    return PR_TARGETS.filter(t => best.has(t)).map(t => best.get(t)!)
  }

  async function computeRecords() {
    const sportActivities = activities.value
    if (sportActivities.length === 0) {
      records.value = []
      return
    }

    await ensureIndex(sportActivities)

    const range = getRecordPeriodRange(selectedPeriod.value)
    records.value = collect(sportActivities.filter(a => inRange(a.startTime, range)))

    dropLegacyCache([...new Set(sportActivities.map(a => (a.type || '').toLowerCase()))])
  }

  watch([activities, selectedSport, selectedPeriod], computeRecords, { immediate: true })

  return {
    records,
    computing: indexing,
    progress
  }
}

/** Distances the records table can show, for callers that need the vocabulary */
export const RECORD_DISTANCES = DISTANCE_TARGETS.filter(t => PR_TARGETS.includes(t.meters))
