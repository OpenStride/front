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
 * What one activity put into the period records, so it can be taken out again.
 *
 * Kept in `aggregatedData` beside the records it explains: the store is
 * device-local and wiped by a rebuild, which is exactly the lifetime a ledger
 * of those records needs. It carries no `metricId`, so no reader of the
 * records ever sees it.
 */
interface ContributionEntry {
  recordId: string
  value: number
  aggregation: AggregationMetricDefinition['aggregation']
}

interface ContributionLedger {
  id: string
  kind: 'contribution'
  activityId: string
  entries: ContributionEntry[]
}

interface LedgerMeta {
  id: string
  kind: 'meta'
  version: number
}

type StoredRow = { id: string; kind?: string; metricId?: string }

interface Contribution extends ContributionEntry {
  metricId: string
  periodType: AggregationPeriod
  periodKey: string
}

/** Bumped when stored aggregates must be rebuilt to be trusted again. */
const LEDGER_VERSION = 1
const LEDGER_META_ID = 'meta|aggregation-ledger'

function ledgerId(activityId: string): string {
  return `contribution|${activityId}`
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
  private queue: Promise<void> = Promise.resolve()

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

  /**
   * Bring the aggregates in line with the current state of one activity.
   *
   * Idempotent: whatever this activity contributed before is retracted first,
   * using the ledger rather than the activity at hand. That matters because an
   * activity reaches this method many times over its life — a re-import, a
   * sync pull, an edit — and each time used to add its distance once more, so
   * a week walked twice by the sync read twice the kilometres. Retracting from
   * the ledger also gets an edit right: an activity whose date or distance
   * changed is removed from where it *was* counted, not from where it is now.
   *
   * A soft-deleted activity contributes nothing, so it only retracts.
   */
  addActivityForAggregation(
    activity: Activity | null,
    details: ActivityDetails | null | undefined
  ): Promise<void> {
    if (!activity) return Promise.resolve()
    return this.serialize(async () => {
      const db = await IndexedDBService.getInstance()
      await this.retract(db, activity.id)
      if (activity.deleted) return
      await this.apply(db, activity, details)
    })
  }

  /**
   * Take an activity out of the aggregates (soft delete).
   *
   * Removes what the ledger says it contributed. Removing twice, or removing
   * an activity that was never counted, changes nothing.
   */
  removeActivityFromAggregation(
    activity: Activity | null,
    _details?: ActivityDetails | null
  ): Promise<void> {
    if (!activity) return Promise.resolve()
    return this.serialize(async () => {
      const db = await IndexedDBService.getInstance()
      await this.retract(db, activity.id)
    })
  }

  /**
   * Run aggregate writes one at a time.
   *
   * Every write is a read-modify-write of a period record. A bulk save emits
   * one event per activity in the same tick, so two activities of the same
   * week used to read the same record, each add their own distance to it, and
   * the second write erased the first.
   */
  private serialize(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** What one activity adds to each period record, without touching the store. */
  private contributions(
    activity: Activity,
    details: ActivityDetails | null | undefined
  ): Contribution[] {
    const date = activityDate(activity)
    if (!date) return []
    const out: Contribution[] = []
    for (const metric of this.metrics) {
      if (!metric.enabled) continue
      // An unknown source name — a config written by an older version — yields
      // undefined and is skipped, rather than aggregating a NaN.
      const value = readActivitySource(metric.sourceRef, activity, details ?? undefined)
      if (value === undefined) continue
      for (const p of metric.periods) {
        const key = this.periodKey(p, date)
        out.push({
          recordId: `${metric.id}|${p}|${key}`,
          metricId: metric.id,
          periodType: p,
          periodKey: key,
          value,
          aggregation: metric.aggregation
        })
      }
    }
    return out
  }

  private async apply(
    db: IndexedDBService,
    activity: Activity,
    details: ActivityDetails | null | undefined
  ) {
    const entries = this.contributions(activity, details)

    for (const e of entries) {
      let record: AggregatedRecord | null = null
      try {
        record = await db.getDataFromStore<AggregatedRecord>('aggregatedData', e.recordId)
      } catch {
        /* ignore */
      }
      if (!record) {
        record = {
          id: e.recordId,
          metricId: e.metricId,
          periodType: e.periodType,
          periodKey: e.periodKey,
          value: 0,
          sum: 0,
          count: 0,
          lastUpdated: Date.now()
        }
      }
      // Only sum & avg in sprint 1
      record.sum += e.value
      record.count += 1
      record.value = e.aggregation === 'avg' ? record.sum / record.count : record.sum
      record.lastUpdated = Date.now()
      await db.addItemsToStore('aggregatedData', [record], r => r.id)
      this.notify({ metricId: e.metricId, periodType: e.periodType, periodKey: e.periodKey })
    }

    if (entries.length === 0) return
    const ledger: ContributionLedger = {
      id: ledgerId(activity.id),
      kind: 'contribution',
      activityId: activity.id,
      entries: entries.map(({ recordId, value, aggregation }) => ({ recordId, value, aggregation }))
    }
    await db.addItemsToStore('aggregatedData', [ledger], r => r.id)
  }

  private async retract(db: IndexedDBService, activityId: string) {
    let ledger: ContributionLedger | null = null
    try {
      ledger = await db.getDataFromStore<ContributionLedger>('aggregatedData', ledgerId(activityId))
    } catch {
      /* nothing recorded */
    }
    if (!ledger || !Array.isArray(ledger.entries)) return

    for (const entry of ledger.entries) {
      let record: AggregatedRecord | null = null
      try {
        record = await db.getDataFromStore<AggregatedRecord>('aggregatedData', entry.recordId)
      } catch {
        continue
      }
      if (!record) continue

      record.sum -= entry.value
      record.count = Math.max(0, record.count - 1)
      if (record.count === 0) record.sum = 0
      record.value =
        record.count > 0
          ? entry.aggregation === 'avg'
            ? record.sum / record.count
            : record.sum
          : 0
      record.lastUpdated = Date.now()
      await db.addItemsToStore('aggregatedData', [record], r => r.id)
      this.notify({
        metricId: record.metricId,
        periodType: record.periodType,
        periodKey: record.periodKey
      })
    }

    await db.deleteFromStore('aggregatedData', ledgerId(activityId))
  }

  /**
   * Whether the stored aggregates predate the contribution ledger.
   *
   * Aggregates written before it cannot be corrected incrementally — nothing
   * says what each activity put in — and were inflated by the double counting
   * the ledger exists to stop. They are rebuilt once, from the activities.
   */
  async needsRebuild(): Promise<boolean> {
    if (!this.metrics.some(m => m.enabled)) return false
    const db = await IndexedDBService.getInstance()
    try {
      const meta = await db.getDataFromStore<LedgerMeta>('aggregatedData', LEDGER_META_ID)
      return meta?.version !== LEDGER_VERSION
    } catch {
      return true
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

  /**
   * Replace the period records of the custom aggregates named in `metricIds`.
   *
   * Replace, not merge: the records are a fold of the index, so the fold is the
   * truth and whatever sits in the store is a previous answer to a question
   * that may have changed. Purging only the ids being rebuilt leaves the
   * built-in metrics — which *are* maintained incrementally — untouched.
   */
  async replaceCustomAggregates(metricIds: string[], records: AggregatedRecord[]) {
    if (metricIds.length === 0) return
    const db = await IndexedDBService.getInstance()
    const wanted = new Set(metricIds)

    try {
      const existing = await db.getAllData<AggregatedRecord>('aggregatedData')
      const obsolete = existing.filter(r => wanted.has(r.metricId)).map(r => r.id)
      if (obsolete.length > 0) await db.deleteMultipleFromStore('aggregatedData', obsolete)
    } catch (err) {
      console.warn('[AggregationService] Failed to purge custom aggregate records', err)
    }

    if (records.length > 0) {
      await db.addItemsToStore('aggregatedData', records, r => r.id)
    }

    for (const record of records) {
      this.notify({
        metricId: record.metricId,
        periodType: record.periodType,
        periodKey: record.periodKey
      })
    }
  }

  /**
   * Recompute the built-in aggregates from what the device holds.
   *
   * The details are read through a cursor that keeps only their `stats` — the
   * one part an aggregate source reads — so the samples are never all in
   * memory at once.
   */
  async rebuild(): Promise<void> {
    const db = await IndexedDBService.getInstance()
    const activities = await db.getAllData<Activity>('activities')
    const stats = await db.mapStore<ActivityDetails, ActivityDetails>('activity_details', d =>
      d?.id ? ({ id: d.id, stats: d.stats } as ActivityDetails) : undefined
    )
    await this.rebuildAll(activities, new Map(stats.map(d => [d.id, d])))
  }

  /**
   * Recompute the built-in aggregates from the activities.
   *
   * Only the built-in records and their ledger are purged: the custom
   * aggregates folded into the same store belong to the metrics index, which
   * would otherwise leave their tiles empty until its next pass. Soft-deleted
   * activities are skipped — `exportDB` hands them over with the rest.
   */
  rebuildAll(activities: Activity[], detailsMap: Map<string, ActivityDetails | null>) {
    return this.serialize(async () => {
      const db = await IndexedDBService.getInstance()
      const live = activities.filter(a => a && !a.deleted)
      console.log(
        '[AggregationService] rebuildAll activities:',
        live.length,
        'details:',
        detailsMap.size
      )
      try {
        const builtIn = new Set(this.metrics.map(m => m.id))
        const existing = await db.getAllData<StoredRow>('aggregatedData')
        const obsolete = existing
          .filter(r => r.kind === 'contribution' || (r.metricId && builtIn.has(r.metricId)))
          .map(r => r.id)
        if (obsolete.length > 0) await db.deleteMultipleFromStore('aggregatedData', obsolete)
      } catch (err) {
        console.warn('[AggregationService] Failed to purge aggregatedData before rebuild', err)
      }
      // Folded in memory and written in one transaction. Applying the activities
      // one by one cost a read and a write per record — thousands of
      // transactions for a few years of history, during which the dashboard
      // read zero.
      const records = new Map<string, AggregatedRecord>()
      const ledgers: ContributionLedger[] = []
      const now = Date.now()
      for (const act of live) {
        const entries = this.contributions(act, detailsMap.get(act.id) || null)
        if (entries.length === 0) continue
        for (const e of entries) {
          let record = records.get(e.recordId)
          if (!record) {
            record = {
              id: e.recordId,
              metricId: e.metricId,
              periodType: e.periodType,
              periodKey: e.periodKey,
              value: 0,
              sum: 0,
              count: 0,
              lastUpdated: now
            }
            records.set(e.recordId, record)
          }
          record.sum += e.value
          record.count += 1
          record.value = e.aggregation === 'avg' ? record.sum / record.count : record.sum
        }
        ledgers.push({
          id: ledgerId(act.id),
          kind: 'contribution',
          activityId: act.id,
          entries: entries.map(({ recordId, value, aggregation }) => ({
            recordId,
            value,
            aggregation
          }))
        })
      }
      const meta: LedgerMeta = { id: LEDGER_META_ID, kind: 'meta', version: LEDGER_VERSION }
      await db.addItemsToStore<StoredRow>(
        'aggregatedData',
        [...records.values(), ...ledgers, meta],
        r => r.id
      )
      for (const r of records.values()) {
        this.notify({ metricId: r.metricId, periodType: r.periodType, periodKey: r.periodKey })
      }
    })
  }
}

export const aggregationService = AggregationService.getInstance()
