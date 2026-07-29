import { IndexedDBService } from './IndexedDBService'
import { readActivitySource } from '@/types/activitySources'
import { getActivityService, type ActivityServiceEvent } from './ActivityService'
import type { Activity, ActivityDetails } from '@/types/activity'
import type {
  AggregationMetricDefinition,
  AggregatedRecord,
  AggregationPeriod
} from '@/types/aggregation'
import { getISOWeekKey, getMonthKey, periodKey } from '@/utils/dateKeys'

// Re-export for backward compatibility (existing consumers importing from AggregationService)
export { getISOWeekKey, getMonthKey }

/**
 * When the activity happened.
 *
 * `startTime` is seconds or milliseconds depending on the provider; the storage
 * contract does not pin that down, so both are accepted. Null when the activity
 * carries no usable date, which is the one case aggregation must skip.
 */
function activityDate(activity: Activity): Date | null {
  const ts = activity.startTime
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return null
  return new Date(ts < 1e11 ? ts * 1000 : ts)
}

/**
 * Event-driven aggregation service
 *
 * Listens to ActivityService events and incrementally updates aggregations.
 * No O(n) scans - each activity change triggers only the affected aggregates.
 */
export class AggregationService {
  private static instance: AggregationService
  private metrics: AggregationMetricDefinition[] = []
  private subscribers = new Set<
    (ev: { metricId: string; periodType: AggregationPeriod; periodKey: string }) => void
  >()
  private activityServiceListener: ((evt: Event) => void) | null = null

  static getInstance() {
    if (!this.instance) this.instance = new AggregationService()
    return this.instance
  }

  async loadConfigFromSettings() {
    const db = await IndexedDBService.getInstance()
    const cfg = await db.getData<{ metrics: AggregationMetricDefinition[] }>('aggregationConfig')
    console.log(`[AggregationService] Loaded config: ${cfg?.metrics?.length ?? 0} metrics`)
    if (cfg && Array.isArray(cfg.metrics)) {
      this.metrics = cfg.metrics
    } else {
      // default sample metrics
      this.metrics = []
      await db.saveData('aggregationConfig', { metrics: this.metrics })
    }
    console.log(`[AggregationService] ${this.metrics.length} metrics in use`)
  }

  /**
   * Start listening to ActivityService events for automatic aggregation
   * Call this once during app bootstrap
   */
  async startListening() {
    const activityService = await getActivityService()

    this.activityServiceListener = async (evt: Event) => {
      try {
        const e = evt as CustomEvent<ActivityServiceEvent>
        const { type, activity, details } = e.detail

        if (type === 'deleted') {
          await this.removeActivityFromAggregation(activity, details)
        } else {
          await this.addActivityForAggregation(activity, details)
        }
      } catch (error) {
        console.error('[AggregationService] Error handling activity event:', error)
      }
    }

    activityService.emitter.addEventListener('activity-changed', this.activityServiceListener)
    console.log('[AggregationService] Started listening to ActivityService events')
  }

  /**
   * Stop listening to ActivityService events (for testing/cleanup)
   */
  async stopListening() {
    if (this.activityServiceListener) {
      const activityService = await getActivityService()
      activityService.emitter.removeEventListener('activity-changed', this.activityServiceListener)
      this.activityServiceListener = null
      console.log('[AggregationService] Stopped listening to ActivityService events')
    }
  }

  listMetrics() {
    return this.metrics.slice()
  }

  subscribe(
    cb: (ev: { metricId: string; periodType: AggregationPeriod; periodKey: string }) => void
  ) {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }
  private notify(ev: { metricId: string; periodType: AggregationPeriod; periodKey: string }) {
    this.subscribers.forEach(s => {
      try {
        s(ev)
      } catch {
        /* ignored */
      }
    })
  }

  private periodKey(period: AggregationPeriod, date: Date) {
    return periodKey(date, period)
  }

  async addActivityForAggregation(
    activity: Activity | null,
    details: ActivityDetails | null | undefined
  ) {
    if (!activity) return
    const date = activityDate(activity)
    if (!date) return

    const db = await IndexedDBService.getInstance()

    for (const metric of this.metrics) {
      if (!metric.enabled) continue
      // An unknown source name — a config written by an older version — yields
      // undefined and is skipped, rather than aggregating a NaN.
      const numeric = readActivitySource(metric.sourceRef, activity, details ?? undefined)
      if (numeric === undefined) continue

      for (const p of metric.periods) {
        const key = this.periodKey(p, date)
        const id = `${metric.id}|${p}|${key}`
        let record: AggregatedRecord | null = null
        try {
          record = await db.getDataFromStore<AggregatedRecord>('aggregatedData', id)
        } catch {
          /* ignore */
        }
        if (!record) {
          record = {
            id,
            metricId: metric.id,
            periodType: p,
            periodKey: key,
            value: 0,
            sum: 0,
            count: 0,
            lastUpdated: Date.now()
          }
        }
        // Only sum & avg in sprint 1
        record.sum += numeric
        record.count += 1
        record.value = metric.aggregation === 'avg' ? record.sum / record.count : record.sum
        record.lastUpdated = Date.now()
        await db.addItemsToStore('aggregatedData', [record], r => r.id)
        this.notify({ metricId: metric.id, periodType: p, periodKey: key })
      }
    }
  }

  /**
   * Remove activity from aggregations (decrement counters)
   * Called when an activity is soft-deleted
   */
  async removeActivityFromAggregation(
    activity: Activity | null,
    details: ActivityDetails | null | undefined
  ) {
    if (!activity) return
    const date = activityDate(activity)
    if (!date) return

    const db = await IndexedDBService.getInstance()

    for (const metric of this.metrics) {
      if (!metric.enabled) continue
      const numeric = readActivitySource(metric.sourceRef, activity, details ?? undefined)
      if (numeric === undefined) continue

      for (const p of metric.periods) {
        const key = this.periodKey(p, date)
        const id = `${metric.id}|${p}|${key}`

        let record: AggregatedRecord | null = null
        try {
          record = await db.getDataFromStore<AggregatedRecord>('aggregatedData', id)
        } catch {
          // Record doesn't exist, nothing to remove
          continue
        }

        if (!record) continue

        // Decrement
        record.sum -= numeric
        record.count = Math.max(0, record.count - 1) // Prevent negative count
        record.value =
          record.count > 0
            ? metric.aggregation === 'avg'
              ? record.sum / record.count
              : record.sum
            : 0
        record.lastUpdated = Date.now()
        await db.addItemsToStore('aggregatedData', [record], r => r.id)
        this.notify({ metricId: metric.id, periodType: p, periodKey: key })
      }
    }
  }

  async getAggregated(
    metricId: string,
    periodType: AggregationPeriod
  ): Promise<AggregatedRecord[]> {
    const db = await IndexedDBService.getInstance()
    const all = await db.getAllData<AggregatedRecord>('aggregatedData')
    console.log(
      `[AggregationService] getAggregated metricId=${metricId} periodType=${periodType} found`,
      all.length,
      'records'
    )
    return all.filter(r => r.metricId === metricId && r.periodType === periodType)
  }

  async rebuildAll(activities: Activity[], detailsMap: Map<string, ActivityDetails | null>) {
    const db = await IndexedDBService.getInstance()
    console.log(
      '[AggregationService] rebuildAll activities:',
      activities.length,
      'details:',
      detailsMap.size
    )
    // Reset all aggregatedData before rebuild
    try {
      await db.clearStore('aggregatedData')
      console.log('[AggregationService] Purged all records from aggregatedData before rebuild')
    } catch (err) {
      console.warn('[AggregationService] Failed to purge aggregatedData before rebuild', err)
    }
    for (const act of activities) {
      const det = detailsMap.get(act.id) || null
      await this.addActivityForAggregation(act, det)
    }
  }
}

export const aggregationService = AggregationService.getInstance()
