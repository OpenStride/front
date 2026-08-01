import { ref, watch, type Ref } from 'vue'
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

/**
 * Scalars lifted out of the details at scan time.
 *
 * A feed card only ever holds an `Activity`; everything else a card could show —
 * the calories of a gym session, the climb of a hike — lives in
 * `ActivityDetails`, whose samples are far too heavy to load per card. Lifting
 * the handful of numbers here is what this store is for: they are recomputable,
 * so they live in a device-local cache and never sync.
 *
 * SI throughout, like everything stored: metres, metres per second, bpm.
 * Converting here would make a cache depend on a display preference.
 */
export const DERIVED = {
  calories: 'calories',
  /** Metres climbed — reported by the provider, or recovered from the samples. */
  ascent: 'ascent',
  /** Metres descended — the figure a skier reads. */
  descent: 'descent',
  /** Metres per second. */
  maxSpeed: 'maxSpeed',
  avgHeartRate: 'avgHeartRate',
  maxHeartRate: 'maxHeartRate'
} as const

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

/** Bump to recompute every row after an algorithm change, or a new derived value */
export const INDEX_VERSION = 2

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

let indexRequest: Promise<void> = Promise.resolve()

/** A failed pass must not poison the queue, nor surface as an unhandled rejection */
const swallow = () => undefined

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

/**
 * Everything worth keeping from one activity's details: the best time on each
 * target distance (in seconds), plus the `DERIVED` scalars.
 *
 * This is the only place details are read for the index, so it is the only place
 * to add a value to. Anything missing is simply absent from the record — a
 * caller reads `undefined` and drops its slot, which is the app's rule for
 * missing data everywhere else.
 */
function computeValues(ctx: PluginContext, details: ActivityDetails): Record<string, number> {
  const values: Record<string, number> = {}
  const set = (key: string, value: number | undefined | null) => {
    if (typeof value === 'number' && Number.isFinite(value)) values[key] = value
  }

  const stats = details.stats
  set(DERIVED.calories, stats?.calories)
  set(DERIVED.maxSpeed, stats?.maxSpeed)
  set(DERIVED.avgHeartRate, stats?.averageHeartRate)
  set(DERIVED.maxHeartRate, stats?.maxHeartRate)
  set(DERIVED.ascent, stats?.totalAscent)
  set(DERIVED.descent, stats?.totalDescent)

  if (!details.samples?.length) return values

  // Providers that report the elevation win; for everyone else — Strava, and
  // every activity stored before totalDescent existed — recover it from the
  // barometric trace rather than leave the card blank.
  const missingElevation =
    values[DERIVED.ascent] === undefined || values[DERIVED.descent] === undefined
  if (missingElevation && details.samples.some(s => s.elevation != null)) {
    try {
      const change = ctx.analyzer.create(details.samples).elevationChange()
      // A *reported* zero is the provider stating the ground was flat; a
      // *computed* zero only says the trace never moved past the noise floor,
      // which is "nothing to show", as the detail page already treats it.
      if (values[DERIVED.ascent] === undefined && change.ascent > 0)
        set(DERIVED.ascent, change.ascent)
      if (values[DERIVED.descent] === undefined && change.descent > 0)
        set(DERIVED.descent, change.descent)
    } catch {
      // Samples may lack what the analyzer needs; the other values still stand
    }
  }

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
  /**
   * Queue a pass, never two at once.
   *
   * Serialised rather than coalesced: callers pass different lists — the feed
   * the page it renders, the tracker the whole history — so returning the
   * in-flight promise would silently leave the second caller's activities
   * unindexed. A pass with nothing stale costs one read and returns.
   */
  function ensureIndex(activities: Activity[]): Promise<void> {
    const next = indexRequest.catch(swallow).then(() => buildIndex(activities))
    indexRequest = next
    return next
  }

  return {
    derived,
    indexing,
    progress,
    ensureIndex
  }
}

/**
 * Keep the index in step with the activities a feed is showing.
 *
 * Indexing what is on screen rather than the whole history is what makes this
 * affordable on the first screen: a page of ten costs ten targeted detail
 * reads, and the next page pays for itself only once it is actually scrolled
 * to. The cards read `derived` and render nothing for a row that is not there
 * yet, so nothing ever waits on this.
 */
export function useFeedMetricsIndex<T extends Activity>(activities: Ref<T[]>): void {
  const { ensureIndex } = useActivityMetricsIndex()

  watch(
    // The list is grown by `push`, so its identity never changes — watch the ids.
    () => activities.value.map(a => a.id).join('|'),
    () => {
      // A friend's activity has no local details to derive anything from.
      const own = activities.value.filter(a => !a.provider?.startsWith('friend_'))
      if (own.length) void ensureIndex(own).catch(swallow)
    },
    { immediate: true }
  )
}
