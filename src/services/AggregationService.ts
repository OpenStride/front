import { IndexedDBService } from './IndexedDBService'
import { getActivityService, type ActivityServiceEvent } from './ActivityService'
import type {
  AggregationMetricDefinition,
  AggregatedRecord,
  AggregationPeriod
} from '@/types/aggregation'

// Basic ISO week helper (simplified; can refine later)
export function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getYearKey(date: Date): string {
  return `${date.getFullYear()}`
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
    const cfg = await db.getData('aggregationConfig')
    console.log('[AggregationService] Loaded config:', cfg)
    if (cfg && Array.isArray(cfg.metrics)) {
      this.metrics = cfg.metrics as AggregationMetricDefinition[]
    } else {
      // default sample metrics
      this.metrics = []
      await db.saveData('aggregationConfig', { metrics: this.metrics })
    }
    console.log('[AggregationService] Metrics in use:', this.metrics)
  }

  /**
   * Start listening to ActivityService events for automatic aggregation
   * Call this once during app bootstrap
   */
  async startListening() {
    const activityService = await getActivityService()

    this.activityServiceListener = async (evt: Event) => {
      const e = evt as CustomEvent<ActivityServiceEvent>
      const { type, activity, details } = e.detail

      console.log(`[AggregationService] Activity ${type}: ${activity.id}`)

      if (type === 'deleted') {
        // Subtract from aggregations
        await this.removeActivityFromAggregation(activity, details)
      } else {
        // Add or update aggregations (saved, updated)
        await this.addActivityForAggregation(activity, details)
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
      } catch {}
    })
  }

  private getValueByPath(obj: any, path: string) {
    return path.split('.').reduce((acc, p) => (acc && acc[p] != null ? acc[p] : undefined), obj)
  }

  private periodKey(period: AggregationPeriod, date: Date) {
    switch (period) {
      case 'week':
        return getISOWeekKey(date)
      case 'month':
        return getMonthKey(date)
      case 'year':
        return getYearKey(date)
    }
  }

  async addActivityForAggregation(activity: any, details: any) {
    if (!activity) return
    const merged = { ...activity, ...details }
    console.log('[AggregationService] Merging activity', activity?.id, 'merged :', merged)
    // heuristique startTime ms or sec
    const startTs = merged.startTime || merged.start_time || merged.timestamp
    if (!startTs) {
      console.log('[AggregationService] No startTime for activity', activity?.id)
      return
    }
    const date = new Date(typeof startTs === 'number' && startTs < 1e11 ? startTs * 1000 : startTs)

    const db = await IndexedDBService.getInstance()
    console.log('[AggregationService] Aggregating activity', activity?.id, 'details:', details)

    for (const metric of this.metrics) {
      if (!metric.enabled) continue
      const raw = this.getValueByPath(merged, metric.sourceRef)
      console.log(
        `[AggregationService] Metric ${metric.id} sourceRef=${metric.sourceRef} raw=`,
        raw
      )
      if (raw == null) continue
      const numeric = typeof raw === 'number' ? raw : parseFloat(raw)
      if (isNaN(numeric)) {
        console.log(
          `[AggregationService] Metric ${metric.id} value is NaN for activity ${activity?.id}`
        )
        continue
      }

      for (const p of metric.periods) {
        const key = this.periodKey(p, date)
        const id = `${metric.id}|${p}|${key}`
        let record: AggregatedRecord | null = null
        try {
          record = await db.getDataFromStore('aggregatedData', id)
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
        console.log(
          `[AggregationService] Update record ${id}: sum=${record.sum} count=${record.count} value=${record.value}`
        )
        await db.addItemsToStore('aggregatedData', [record], r => r.id)
        this.notify({ metricId: metric.id, periodType: p, periodKey: key })
      }
    }
  }

  /**
   * Remove activity from aggregations (decrement counters)
   * Called when an activity is soft-deleted
   */
  async removeActivityFromAggregation(activity: any, details: any) {
    if (!activity) return
    const merged = { ...activity, ...details }

    // heuristique startTime ms or sec
    const startTs = merged.startTime || merged.start_time || merged.timestamp
    if (!startTs) {
      console.log('[AggregationService] No startTime for deleted activity', activity?.id)
      return
    }
    const date = new Date(typeof startTs === 'number' && startTs < 1e11 ? startTs * 1000 : startTs)

    const db = await IndexedDBService.getInstance()
    console.log('[AggregationService] Removing activity from aggregations', activity?.id)

    for (const metric of this.metrics) {
      if (!metric.enabled) continue
      const raw = this.getValueByPath(merged, metric.sourceRef)
      if (raw == null) continue
      const numeric = typeof raw === 'number' ? raw : parseFloat(raw)
      if (isNaN(numeric)) continue

      for (const p of metric.periods) {
        const key = this.periodKey(p, date)
        const id = `${metric.id}|${p}|${key}`

        let record: AggregatedRecord | null = null
        try {
          record = await db.getDataFromStore('aggregatedData', id)
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

        console.log(
          `[AggregationService] Decremented record ${id}: sum=${record.sum} count=${record.count} value=${record.value}`
        )
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
    const all = await db.getAllData('aggregatedData')
    console.log(
      `[AggregationService] getAggregated metricId=${metricId} periodType=${periodType} found`,
      all.length,
      'records'
    )
    return (all as AggregatedRecord[]).filter(
      r => r.metricId === metricId && r.periodType === periodType
    )
  }

  async rebuildAll(activities: any[], detailsMap: Map<string, any>) {
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
