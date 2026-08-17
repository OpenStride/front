import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import { usePluginContext } from '@/composables/usePluginContext'
import { periodKey } from '@/utils/dateKeys'
import type { AggregationMetricDefinition, AggregationPeriod } from '@/types/aggregation'
import type { Activity, ActivityDetails } from '@/types/activity'

/**
 * The running totals at the head of the statistics page, read from the
 * aggregation store rather than by grouping the activity list.
 *
 * `ctx.aggregation` keeps a sum per period, updated by the activity events
 * themselves, so the figure is there before anything is scanned. Both the
 * compact "Totaux" section and the dashboard KPI band read the same numbers —
 * this composable owns the reconcile / rebuild / subscribe lifecycle once so
 * neither has to copy it.
 */

export const SUMMARY_PERIODS: AggregationPeriod[] = ['week', 'month', 'year']

/**
 * The metrics this composable registers, named by their base id.
 *
 * Labels are looked up at render time rather than stored: the config is
 * replicated, so a stored French string would follow the user who wrote it onto
 * every other device. `dimension` is what the renderer converts through — a
 * stored unit and factor would be a second, preference-blind copy of the
 * conversion table.
 */
export const SUMMARY_BASE_METRICS = [
  { id: 'distance', sourceRef: 'distance', unit: 'm', dimension: 'distance', decimals: 1 },
  { id: 'duration', sourceRef: 'duration', unit: 's', decimals: 0 },
  {
    id: 'totalAscent',
    sourceRef: 'stats.totalAscent',
    unit: 'm',
    dimension: 'elevation',
    decimals: 0
  }
] as const

/** A date sitting inside the period before the current one, for a delta. */
function previousPeriodDate(period: AggregationPeriod): Date {
  const d = new Date()
  if (period === 'week') d.setDate(d.getDate() - 7)
  else if (period === 'month') d.setMonth(d.getMonth() - 1)
  else d.setFullYear(d.getFullYear() - 1)
  return d
}

export interface SummaryTotals {
  /** The period the figures name; drives a re-read when changed. */
  period: Ref<AggregationPeriod>
  /** The reconciled metric definitions enabled for the current period. */
  definitions: Ref<AggregationMetricDefinition[]>
  /** SI value of the current period, keyed by definition id. */
  values: Ref<Record<string, number>>
  /** SI value of the period before, keyed by definition id (for a delta). */
  previousValues: Ref<Record<string, number>>
  PERIODS: AggregationPeriod[]
  BASE_METRICS: typeof SUMMARY_BASE_METRICS
}

export function useSummaryTotals(initialPeriod: AggregationPeriod = 'week'): SummaryTotals {
  const { storage, aggregation } = usePluginContext()

  const period = ref<AggregationPeriod>(initialPeriod)
  const definitions = ref<AggregationMetricDefinition[]>([])
  const values = ref<Record<string, number>>({})
  const previousValues = ref<Record<string, number>>({})

  /**
   * Bring the stored definitions in line with what this page expects.
   *
   * Reconciled every time, not merely completed when absent: a config written by
   * an older version stays frozen in its old shape otherwise — it still carries
   * `displayUnit`/`displayFactor` and no `dimension`, so a distance renders as
   * raw metres, and because nothing "changed" the aggregates are never rebuilt
   * either. `enabled` is the one field a user can own, so it is preserved.
   */
  async function reconcileMetrics(): Promise<boolean> {
    const metrics = aggregation.listMetrics()
    let changed = false

    for (const base of SUMMARY_BASE_METRICS) {
      for (const p of SUMMARY_PERIODS) {
        const id = `${p}_${base.id}`
        const expected = {
          sourceRef: base.sourceRef,
          aggregation: 'sum' as const,
          periods: [p],
          unit: base.unit,
          decimals: base.decimals,
          dimension: 'dimension' in base ? base.dimension : undefined
        }
        const existing = metrics.find(m => m.id === id)

        if (!existing) {
          metrics.push({ id, label: base.id, enabled: true, ...expected })
          changed = true
          continue
        }

        const stale =
          existing.sourceRef !== expected.sourceRef ||
          existing.unit !== expected.unit ||
          existing.decimals !== expected.decimals ||
          existing.dimension !== expected.dimension ||
          'displayFactor' in existing ||
          'displayUnit' in existing

        if (!stale) continue

        Object.assign(existing, expected)
        // Drop what the type no longer knows about, so the shape converges.
        delete (existing as Record<string, unknown>).displayFactor
        delete (existing as Record<string, unknown>).displayUnit
        changed = true
      }
    }
    if (!changed) return false

    await storage.saveData('aggregationConfig', { metrics })
    await aggregation.loadConfigFromSettings()
    return true
  }

  async function rebuildFromScratch() {
    // `exportDB` cannot know what a store holds, so the shape is asserted once
    // here rather than smuggled through `Record<string, unknown>` at the call.
    const activities = (await storage.exportDB('activities')) as Activity[]
    const allDetails = (await storage.exportDB('activity_details')) as ActivityDetails[]
    const detailsMap = new Map<string, ActivityDetails | null>()
    for (const d of allDetails) {
      if (d?.id) detailsMap.set(d.id, d)
    }
    await aggregation.rebuildAll(activities, detailsMap)
  }

  /**
   * The aggregate of the period the reader is in, not of the last one on record.
   *
   * A tile that silently showed a fortnight-old week would read as this week's
   * total. A week with nothing in it has a total, and that total is zero.
   *
   * Returns whether the store holds no aggregate at all for these definitions.
   */
  async function loadTotals(): Promise<{ empty: boolean }> {
    const enabled = aggregation
      .listMetrics()
      .filter(m => m.enabled && m.periods.includes(period.value))
    definitions.value = enabled

    const currentKey = periodKey(new Date(), period.value)
    const prevKey = periodKey(previousPeriodDate(period.value), period.value)
    const next: Record<string, number> = {}
    const prev: Record<string, number> = {}
    let records = 0

    await Promise.all(
      enabled.map(async def => {
        const stored = await aggregation.getAggregated(def.id, period.value)
        records += stored.length
        next[def.id] = stored.find(r => r.periodKey === currentKey)?.value ?? 0
        prev[def.id] = stored.find(r => r.periodKey === prevKey)?.value ?? 0
      })
    )

    values.value = next
    previousValues.value = prev
    return { empty: records === 0 }
  }

  let unsubscribe: (() => void) | null = null

  watch(period, () => {
    void loadTotals()
  })

  onMounted(async () => {
    const reconciled = await reconcileMetrics()
    if (reconciled) await rebuildFromScratch()

    const { empty } = await loadTotals()
    // A definition can exist with no aggregate behind it — the aggregation is
    // event-driven, so activities imported before the metric was registered were
    // never counted. Rebuilding once here is what turns a section of zeroes into
    // a section of figures; `rebuildAll` purges first, so it cannot double-count.
    if (empty) {
      const activities = await storage.exportDB('activities')
      if (activities.length > 0) {
        await rebuildFromScratch()
        await loadTotals()
      }
    }

    // An import lands as activity events, which the aggregation turns into new
    // records; without this the figures would stay frozen at page load.
    unsubscribe = aggregation.subscribe(() => {
      void loadTotals()
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return {
    period,
    definitions,
    values,
    previousValues,
    PERIODS: SUMMARY_PERIODS,
    BASE_METRICS: SUMMARY_BASE_METRICS
  }
}
