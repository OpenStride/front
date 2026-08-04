import { IndexedDBService } from './IndexedDBService'
import type { CustomAggregate } from '@/types/customAggregate'

export const CUSTOM_AGGREGATES_STORE = 'custom_aggregates'

/** Fields the caller provides; the rest is bookkeeping this service owns. */
export type CustomAggregateInput = Omit<
  CustomAggregate,
  'id' | 'version' | 'lastModified' | 'synced' | 'deleted'
>

export interface CustomAggregateServiceEvent {
  type: 'aggregates-changed'
  /** Ids touched by the change, so a listener can recompute only those. */
  ids: string[]
}

/**
 * `crypto.randomUUID` is unavailable over plain HTTP and in some older
 * WebViews, where it would throw rather than return something weak. The
 * fallback only has to be unique within one user's own store.
 */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `agg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * CRUD over the saved aggregate definitions.
 *
 * The definitions are the only part of the custom-metrics chain that cannot be
 * recomputed, so this store syncs while the values it drives stay device-local
 * (`activity_metrics`, in `LOCAL_ONLY_STORES`). Splitting them that way is what
 * lets a rebuild of the cache be free and a lost definition be impossible.
 *
 * Every write bumps `version` and clears `synced`, which is what the
 * reconciliation in `TimestampedSync` reads to decide direction. A service that
 * wrote the store directly, without those two, would produce records the sync
 * cannot rank.
 */
export class CustomAggregateService {
  private static instance: CustomAggregateService
  public emitter = new EventTarget()

  public static getInstance(): CustomAggregateService {
    if (!CustomAggregateService.instance) {
      CustomAggregateService.instance = new CustomAggregateService()
    }
    return CustomAggregateService.instance
  }

  private async db() {
    return IndexedDBService.getInstance()
  }

  private emit(ids: string[]): void {
    this.emitter.dispatchEvent(
      new CustomEvent<CustomAggregateServiceEvent>('aggregates-changed', {
        detail: { type: 'aggregates-changed', ids }
      })
    )
  }

  private async write(records: CustomAggregate[]): Promise<void> {
    const db = await this.db()
    await db.addItemsToStore(CUSTOM_AGGREGATES_STORE, records, (r: CustomAggregate) => r.id)
  }

  /** Live definitions, tombstones excluded — what the UI and the indexer read. */
  public async list(): Promise<CustomAggregate[]> {
    return (await this.listAll()).filter(a => !a.deleted)
  }

  /** Every row including tombstones — what sync reads. */
  public async listAll(): Promise<CustomAggregate[]> {
    const db = await this.db()
    const rows = await db.getAllData<CustomAggregate>(CUSTOM_AGGREGATES_STORE)
    return rows ?? []
  }

  public async get(id: string): Promise<CustomAggregate | null> {
    const found = (await this.listAll()).find(a => a.id === id)
    return found ?? null
  }

  public async create(input: CustomAggregateInput): Promise<CustomAggregate> {
    const record: CustomAggregate = {
      ...input,
      id: newId(),
      version: 1,
      lastModified: Date.now(),
      synced: false
    }
    await this.write([record])
    this.emit([record.id])
    return record
  }

  /**
   * Patch a definition. Returns null when the id is unknown or already deleted:
   * reviving a tombstone by writing over it would strip the delete of the
   * higher version that makes it win at the next sync.
   */
  public async update(
    id: string,
    patch: Partial<CustomAggregateInput>
  ): Promise<CustomAggregate | null> {
    const existing = await this.get(id)
    if (!existing || existing.deleted) return null

    const updated: CustomAggregate = {
      ...existing,
      ...patch,
      id: existing.id,
      version: existing.version + 1,
      lastModified: Date.now(),
      synced: false
    }
    await this.write([updated])
    this.emit([id])
    return updated
  }

  /**
   * Soft delete. The row stays, flagged, and keeps being pushed.
   *
   * Deleting it outright would remove the only evidence the deletion happened;
   * the next sync would see a record the remote has and we lack, and pull it
   * back — the resurrection this store was split out to avoid.
   */
  public async remove(id: string): Promise<boolean> {
    const existing = await this.get(id)
    if (!existing || existing.deleted) return false

    await this.write([
      {
        ...existing,
        deleted: true,
        enabled: false,
        version: existing.version + 1,
        lastModified: Date.now(),
        synced: false
      }
    ])
    this.emit([id])
    return true
  }

  public async getUnsynced(): Promise<CustomAggregate[]> {
    return (await this.listAll()).filter(a => !a.synced)
  }

  public async markAsSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const wanted = new Set(ids)
    const touched = (await this.listAll())
      .filter(a => wanted.has(a.id))
      .map(a => ({ ...a, synced: true }))

    if (touched.length > 0) await this.write(touched)
  }

  /**
   * Store records pulled from a remote, as-is.
   *
   * `synced: true` because they came from the remote and match it; marking them
   * unsynced would push them straight back and raise a false conflict on the
   * next round — the same trap the `fromSync` flag guards in ActivityService.
   */
  public async applyRemote(records: CustomAggregate[]): Promise<void> {
    if (records.length === 0) return
    await this.write(records.map(r => ({ ...r, synced: true })))
    this.emit(records.map(r => r.id))
  }
}

export function getCustomAggregateService(): CustomAggregateService {
  return CustomAggregateService.getInstance()
}
