import { IndexedDBService } from './IndexedDBService'
import type { Gear, GearInput } from '@/types/gear'

export const GEAR_STORE = 'gear'

export interface GearServiceEvent {
  type: 'gear-changed'
  ids: string[]
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `gear_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The reader's gear: a handful of hand-written rows, synced by SyncService
 * the way custom aggregates are (version, last write wins, tombstones) and
 * not by the generic backup, whose additive merge would lose edits made on
 * another device and bring deleted gear back.
 */
export class GearService {
  private static instance: GearService
  public emitter = new EventTarget()

  public static getInstance(): GearService {
    if (!GearService.instance) GearService.instance = new GearService()
    return GearService.instance
  }

  private async db() {
    return IndexedDBService.getInstance()
  }

  private emit(ids: string[]): void {
    this.emitter.dispatchEvent(
      new CustomEvent<GearServiceEvent>('gear-changed', {
        detail: { type: 'gear-changed', ids }
      })
    )
  }

  private async write(records: Gear[]): Promise<void> {
    const db = await this.db()
    await db.addItemsToStore(GEAR_STORE, records, (r: Gear) => r.id)
  }

  /** Live gear, tombstones excluded. */
  public async list(): Promise<Gear[]> {
    return (await this.listAll()).filter(g => !g.deleted)
  }

  /** Every row including tombstones — what sync reads. */
  public async listAll(): Promise<Gear[]> {
    const db = await this.db()
    return (await db.getAllData<Gear>(GEAR_STORE)) ?? []
  }

  public async get(id: string): Promise<Gear | null> {
    return (await this.listAll()).find(g => g.id === id) ?? null
  }

  public async create(input: GearInput): Promise<Gear> {
    const record: Gear = {
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

  /** Patch a gear. Null when unknown or deleted: a tombstone is never revived. */
  public async update(id: string, patch: Partial<GearInput>): Promise<Gear | null> {
    const existing = await this.get(id)
    if (!existing || existing.deleted) return null
    const updated: Gear = {
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

  /** Soft delete: the row stays, flagged, so the deletion reaches other devices. */
  public async remove(id: string): Promise<boolean> {
    const existing = await this.get(id)
    if (!existing || existing.deleted) return false
    await this.write([
      {
        ...existing,
        deleted: true,
        version: existing.version + 1,
        lastModified: Date.now(),
        synced: false
      }
    ])
    this.emit([id])
    return true
  }

  public async markAsSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const wanted = new Set(ids)
    const touched = (await this.listAll())
      .filter(g => wanted.has(g.id))
      .map(g => ({ ...g, synced: true }))
    if (touched.length > 0) await this.write(touched)
  }

  /** Store records pulled from a remote, as-is and marked synced. */
  public async applyRemote(records: Gear[]): Promise<void> {
    if (records.length === 0) return
    await this.write(records.map(r => ({ ...r, synced: true })))
    this.emit(records.map(r => r.id))
  }
}

export function getGearService(): GearService {
  return GearService.getInstance()
}
