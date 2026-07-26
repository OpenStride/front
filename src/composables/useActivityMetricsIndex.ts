import { ref } from 'vue'
import type { Activity, ActivityDetails } from '@/types/activity'
import { getPluginContext } from '@/services/PluginContextFactory'
import type { PluginContext } from '@/types/plugin-context'
import { toMs } from '@/utils/timeRange'

const STORE = 'activity_metrics'

/**
 * Distances the index computes a best time for.
 *
 * Lives here rather than in a plugin because two of them read the same rows:
 * the metric tracker plots them over time, the statistics records take the
 * minimum over a period. Plugins cannot import each other, so the shared
 * vocabulary belongs to the app.
 */
export const DISTANCE_TARGETS: { meters: number; label: string }[] = [
  { meters: 1_000, label: '1 km' },
  { meters: 2_000, label: '2 km' },
  { meters: 5_000, label: '5 km' },
  { meters: 10_000, label: '10 km' },
  { meters: 15_000, label: '15 km' },
  { meters: 20_000, label: '20 km' },
  { meters: 21_097, label: '21,1 km' },
  { meters: 30_000, label: '30 km' },
  { meters: 42_195, label: '42,2 km' },
  { meters: 50_000, label: '50 km' }
]

export function timeMetricId(meters: number): string {
  return `time_${meters}`
}

/** Per-activity derived values, keyed by activity id */
export type DerivedMap = Map<string, Record<string, number>>

/** One row of the `activity_metrics` store */
export interface ActivityMetricsRow {
  /** The activity id — this store is keyed on it */
  id: string
  startTime: number
  sport: string
  /** Index format; a row built by an older version is recomputed */
  indexVersion: number
  values: Record<string, number>
}

/** Bump to recompute every row after an algorithm change */
const INDEX_VERSION = 1

// Max plausible speed in m/s — 50 km/h filters GPS glitches while keeping any real effort
const MAX_SPEED_MS = 50 / 3.6

// Same trade-off as the records section: below this many activities to index,
// reading their details one by one beats deserializing the whole store
const TARGETED_FETCH_MAX = 150
const FETCH_BATCH_SIZE = 25
const INDEX_CHUNK_SIZE = 20

const TARGET_METERS = DISTANCE_TARGETS.map(t => t.meters)

const derived = ref<DerivedMap>(new Map())
const indexing = ref(false)
const progress = ref(0)

let indexRequest: Promise<void> | null = null

async function loadDetails(
  ctx: PluginContext,
  activities: Activity[]
): Promise<Map<string, ActivityDetails>> {
  const detailsMap = new Map<string, ActivityDetails>()

  if (activities.length > TARGETED_FETCH_MAX) {
    const allDetails = (await ctx.storage.exportDB('activity_details')) as ActivityDetails[]
    for (const d of allDetails) {
      detailsMap.set(d.id, d)
    }
    return detailsMap
  }

  for (let i = 0; i < activities.length; i += FETCH_BATCH_SIZE) {
    const batch = activities.slice(i, i + FETCH_BATCH_SIZE)
    const loaded = await Promise.all(batch.map(a => ctx.activity.getDetails(a.id)))
    for (const d of loaded) {
      if (d) detailsMap.set(d.id, d)
    }
  }

  return detailsMap
}

/** Best time on each target distance, in seconds */
function computeValues(ctx: PluginContext, details: ActivityDetails): Record<string, number> {
  const values: Record<string, number> = {}
  if (!details.samples?.length) return values

  // An activity with no distance channel can't yield a segment
  if (!details.samples.some(s => s.distance != null && s.time != null)) return values

  try {
    const segments = ctx.analyzer.create(details.samples).bestSegments(TARGET_METERS)
    for (const meters of TARGET_METERS) {
      const segment = segments[meters]
      if (!segment || segment.duration <= 0) continue
      // Discard GPS glitches rather than record an impossible time
      if (meters / segment.duration > MAX_SPEED_MS) continue
      values[timeMetricId(meters)] = segment.duration
    }
  } catch {
    // Samples may lack what the analyzer needs; leave the activity unindexed
  }

  return values
}

function toDerivedMap(rows: ActivityMetricsRow[]): DerivedMap {
  const map: DerivedMap = new Map()
  for (const row of rows) {
    map.set(row.id, row.values)
  }
  return map
}

/**
 * Bring the index up to date and expose it.
 *
 * Only activities missing a row — or holding one built by an older index
 * version — are computed, so a fresh import costs one activity, while a wiped
 * IndexedDB costs a full rebuild. The store is device-local: losing it is a
 * recompute, never a data loss.
 */
async function buildIndex(activities: Activity[]): Promise<void> {
  const ctx = await getPluginContext()

  const existing = ((await ctx.storage.exportDB(STORE)) ?? []) as ActivityMetricsRow[]
  const byId = new Map(existing.map(row => [row.id, row]))
  derived.value = toDerivedMap(existing)

  const stale = activities.filter(a => byId.get(a.id)?.indexVersion !== INDEX_VERSION)
  if (stale.length === 0) return

  indexing.value = true
  progress.value = 0

  try {
    const detailsMap = await loadDetails(ctx, stale)
    const rows: ActivityMetricsRow[] = []

    for (let i = 0; i < stale.length; i += INDEX_CHUNK_SIZE) {
      const chunk = stale.slice(i, i + INDEX_CHUNK_SIZE)

      for (const activity of chunk) {
        const details = detailsMap.get(activity.id)
        rows.push({
          id: activity.id,
          startTime: toMs(activity.startTime),
          sport: (activity.type || '').toLowerCase(),
          indexVersion: INDEX_VERSION,
          // An activity with no usable samples still gets a row, so it is not
          // rescanned on every visit
          values: details ? computeValues(ctx, details) : {}
        })
      }

      progress.value = Math.min(100, Math.round(((i + chunk.length) / stale.length) * 100))

      // Yield to the main thread between chunks
      if (i + INDEX_CHUNK_SIZE < stale.length) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    await ctx.storage.addItemsToStore(STORE, rows, row => row.id)

    for (const row of rows) {
      byId.set(row.id, row)
    }
    derived.value = toDerivedMap(Array.from(byId.values()))
    progress.value = 100
  } finally {
    indexing.value = false
  }
}

export function useActivityMetricsIndex() {
  /** Coalesces concurrent calls so a rebuild never runs twice */
  function ensureIndex(activities: Activity[]): Promise<void> {
    if (indexRequest) return indexRequest
    indexRequest = buildIndex(activities).finally(() => {
      indexRequest = null
    })
    return indexRequest
  }

  return {
    derived,
    indexing,
    progress,
    ensureIndex
  }
}
