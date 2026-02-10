import { ref, watch, type Ref } from 'vue'
import type { Activity, ActivityDetails } from '@/types/activity'
import { IndexedDBService } from '@/services/IndexedDBService'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'
import type { PersonalRecord, PRCache } from '../types'

const PR_TARGETS = [1_000, 2_000, 5_000, 10_000, 15_000, 20_000, 21_097, 42_195]

// Max plausible speed in m/s — 50 km/h filters GPS glitches while keeping any real effort
const MAX_SPEED_MS = 50 / 3.6

// Bump this to invalidate cached PR data after algorithm changes
const CACHE_VERSION = 2

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

function cacheKey(sport: string): string {
  return `statistics_pr_cache_${sport || 'all'}`
}

export function usePersonalRecords(activities: Ref<Activity[]>, selectedSport: Ref<string>) {
  const records = ref<PersonalRecord[]>([])
  const computing = ref(false)
  const progress = ref(0)

  async function computeRecords() {
    const acts = activities.value
    if (acts.length === 0) {
      records.value = []
      return
    }

    const sport = selectedSport.value
    const activityCount = acts.length
    const maxLastModified = Math.max(...acts.map(a => a.lastModified || 0))

    // Check cache
    const db = await IndexedDBService.getInstance()
    const cached = (await db.getData(cacheKey(sport))) as PRCache | undefined
    if (
      cached &&
      (cached as any).cacheVersion === CACHE_VERSION &&
      cached.activityCount === activityCount &&
      cached.maxLastModified === maxLastModified &&
      cached.sport === sport
    ) {
      records.value = cached.records
      return
    }

    computing.value = true
    progress.value = 0

    // Load all activity_details in one batch
    const allDetails = (await db.getAllData('activity_details')) as ActivityDetails[]
    const detailsMap = new Map<string, ActivityDetails>()
    for (const d of allDetails) {
      detailsMap.set(d.id, d)
    }

    const best = new Map<number, PersonalRecord>()
    const chunkSize = 20

    for (let i = 0; i < acts.length; i += chunkSize) {
      const chunk = acts.slice(i, i + chunkSize)

      for (const activity of chunk) {
        const details = detailsMap.get(activity.id)
        if (!details?.samples?.length) continue

        // Skip activities without distance data
        const hasDistance = details.samples.some(s => s.distance != null && s.time != null)
        if (!hasDistance) continue

        try {
          const analyzer = new ActivityAnalyzer(details.samples)
          const segments = analyzer.bestSegments(PR_TARGETS)

          for (const target of PR_TARGETS) {
            const seg = segments[target]
            if (!seg) continue

            // Filter GPS glitches: skip segments with unrealistic speed
            if (seg.duration <= 0 || target / seg.duration > MAX_SPEED_MS) continue

            const existing = best.get(target)
            if (!existing || seg.duration < existing.duration) {
              const paceMinPerKm = seg.duration / (target / 1000) / 60
              best.set(target, {
                distance: target,
                distanceLabel: PR_LABELS[target],
                duration: seg.duration,
                pace: paceMinPerKm,
                speed: target / 1000 / (seg.duration / 3600),
                date: activity.startTime,
                activityId: activity.id
              })
            }
          }
        } catch {
          // Activity samples may lack required data, skip silently
        }
      }

      progress.value = Math.min(100, Math.round(((i + chunk.length) / acts.length) * 100))

      // Yield to main thread
      if (i + chunkSize < acts.length) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    const result = PR_TARGETS.filter(t => best.has(t)).map(t => best.get(t)!)
    records.value = result

    // Save to cache
    await db.saveData(cacheKey(sport), {
      cacheVersion: CACHE_VERSION,
      activityCount,
      maxLastModified,
      sport,
      records: result
    })

    computing.value = false
    progress.value = 100
  }

  watch([activities, selectedSport], computeRecords, { immediate: true })

  return {
    records,
    computing,
    progress
  }
}
